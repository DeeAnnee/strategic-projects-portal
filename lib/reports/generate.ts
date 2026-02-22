import {
  calculateDepreciationOfCapitalByYear,
  calculateFinancialMetrics,
  calculateNetBenefitsByYear
} from "../submissions/financial-metrics";
import type { FinancialGrid, InvestmentCell, ProjectSubmission } from "../submissions/types";

const formatDate = (value?: string) => {
  if (!value) return "-";
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return value;
  return asDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const formatNumber = (value: number) => number.format(Number.isFinite(value) ? value : 0);

const defaultFinancialGrid = (): FinancialGrid => {
  const year = new Date().getFullYear();
  const zeroCell = (): InvestmentCell => ({ priorYears: 0, currentFiscal: 0, future: 0 });

  return {
    commencementFiscalYear: year,
    investment: {
      hardware: zeroCell(),
      software: zeroCell(),
      consultancyVendor: zeroCell(),
      premisesRealEstate: zeroCell(),
      otherCapital: zeroCell(),
      expenses: zeroCell()
    },
    incremental: {
      years: [year + 1, year + 2, year + 3, year + 4, year + 5],
      revenue: [0, 0, 0, 0, 0],
      savedCosts: [0, 0, 0, 0, 0],
      addlOperatingCosts: [0, 0, 0, 0, 0]
    }
  };
};

const ensureFinancialGrid = (grid?: FinancialGrid) => grid ?? defaultFinancialGrid();

const mergeInvestmentCells = (left: InvestmentCell, right: InvestmentCell): InvestmentCell => ({
  priorYears: left.priorYears + right.priorYears,
  currentFiscal: left.currentFiscal + right.currentFiscal,
  future: left.future + right.future
});

const investmentLifeTotal = (cell: InvestmentCell) => cell.priorYears + cell.currentFiscal + cell.future;

const formatInvestmentLine = (
  label: string,
  fiscalYear: number,
  cell: InvestmentCell
) =>
  `${label}: Prior Yrs ${formatNumber(cell.priorYears)} | F${fiscalYear} ${formatNumber(cell.currentFiscal)} | Future ${formatNumber(cell.future)} | Life ${formatNumber(investmentLifeTotal(cell))}`;

const formatYearSeries = (label: string, years: number[], values: number[]) =>
  `${label}: ${years.map((year, index) => `F${year} ${formatNumber(values[index] ?? 0)}`).join(" | ")}`;

export const generateCsvReport = (rows: ProjectSubmission[]) => {
  const header = [
    "CaseID",
    "Title",
    "BusinessUnit",
    "OpCo",
    "ProjectTheme",
    "SegmentUnit",
    "StartDate",
    "EndDate",
    "Stage",
    "Status",
    "SponsorDecision",
    "Priority",
    "RiskLevel",
    "RegulatoryFlag",
    "CostSaveEst",
    "RevenueUpliftEst",
    "CAPEX",
    "OPEX",
    "OneTimeCosts",
    "RunRateSavings",
    "PaybackMonths",
    "PaybackYears",
    "NPV",
    "IRR",
    "Owner"
  ];

  const lines = rows.map((row) => [
    row.id,
    row.title,
    row.businessUnit,
    row.opco ?? "",
    row.projectTheme ?? "",
    row.segmentUnit ?? "",
    row.startDate ?? "",
    row.endDate ?? "",
    row.stage,
    row.status,
    row.workflow.sponsorDecision,
    row.priority,
    row.riskLevel,
    row.regulatoryFlag,
    row.benefits.costSaveEst,
    row.benefits.revenueUpliftEst,
    row.financials.capex,
    row.financials.opex,
    row.financials.oneTimeCosts,
    row.financials.runRateSavings,
    row.financials.paybackMonths,
    row.financials.paybackYears ?? "",
    row.financials.npv ?? "",
    row.financials.irr ?? "",
    row.ownerName
  ]);

  return [header, ...lines]
    .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
};

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_MARGIN_X = 50;
const PDF_START_Y = 760;
const PDF_BOTTOM_Y = 52;
const PDF_FONT_SIZE = 11;
const PDF_TEXT_LEADING = 15;
const PDF_APPROX_CHAR_WIDTH = 6;
const PDF_MAX_CHARS_PER_LINE = Math.floor((PDF_PAGE_WIDTH - PDF_MARGIN_X * 2) / PDF_APPROX_CHAR_WIDTH);
const PDF_MAX_LINES_PER_PAGE = Math.floor((PDF_START_Y - PDF_BOTTOM_Y) / PDF_TEXT_LEADING) + 1;

const normalizePdfText = (value: string) =>
  value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[^\x20-\x7E]/g, " ");

const escapePdfText = (value: string) =>
  normalizePdfText(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

const wrapLine = (line: string, maxChars: number) => {
  const normalized = normalizePdfText(line).trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(/\s+/);
  const wrapped: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (currentLine) {
        wrapped.push(currentLine);
        currentLine = "";
      }

      for (let cursor = 0; cursor < word.length; cursor += maxChars) {
        wrapped.push(word.slice(cursor, cursor + maxChars));
      }
      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxChars) {
      currentLine = nextLine;
    } else {
      wrapped.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine || wrapped.length === 0) {
    wrapped.push(currentLine);
  }

  return wrapped;
};

const buildPdfPageStream = (lines: string[]) => {
  const textCommands = lines.flatMap((line, index) => {
    const escaped = `(${escapePdfText(line)}) Tj`;
    if (index === 0) {
      return [escaped];
    }
    return ["T*", escaped];
  });

  return [
    "BT",
    `/F1 ${PDF_FONT_SIZE} Tf`,
    `${PDF_TEXT_LEADING} TL`,
    `${PDF_MARGIN_X} ${PDF_START_Y} Td`,
    ...textCommands,
    "ET"
  ].join("\n");
};

export const generateSimplePdf = (title: string, bodyLines: string[]) => {
  const normalizedInputLines = [title, "", ...bodyLines]
    .flatMap((line) => String(line).split("\n"))
    .flatMap((line) => wrapLine(line, PDF_MAX_CHARS_PER_LINE));

  const pagedLines: string[][] = [];
  for (let cursor = 0; cursor < normalizedInputLines.length; cursor += PDF_MAX_LINES_PER_PAGE) {
    pagedLines.push(normalizedInputLines.slice(cursor, cursor + PDF_MAX_LINES_PER_PAGE));
  }
  if (pagedLines.length === 0) {
    pagedLines.push([""]);
  }

  const objectBodies: string[] = [];
  const addObject = (body: string) => {
    objectBodies.push(body);
    return objectBodies.length;
  };

  const catalogRef = addObject("");
  const pagesRef = addObject("");
  const fontRef = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageRefs: string[] = [];

  for (const pageLines of pagedLines) {
    const stream = buildPdfPageStream(pageLines);
    const contentRef = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream`);
    const pageRef = addObject(
      `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentRef} 0 R >>`
    );
    pageRefs.push(`${pageRef} 0 R`);
  }

  objectBodies[catalogRef - 1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
  objectBodies[pagesRef - 1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objectBodies.forEach((body, index) => {
    const objectNumber = index + 1;
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${objectNumber} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objectBodies.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objectBodies.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
};

export const generateSubmissionSummaryLines = (item: ProjectSubmission) => [
  `Case ID: ${item.id}`,
  `Title: ${item.title}`,
  `Request Type: ${item.requestType}`,
  `Stage: ${item.stage}`,
  `Status: ${item.status}`,
  `Business Unit: ${item.businessUnit || "-"}`,
  `Sponsor: ${item.businessSponsor || item.sponsorName || "-"}`,
  `Owner: ${item.ownerName || "-"} (${item.ownerEmail || "-"})`,
  `Start Date: ${formatDate(item.startDate)}`,
  `End Date: ${formatDate(item.endDate)}`,
  "",
  "Overview",
  item.summary || "-",
  "",
  "Financial Snapshot",
  `Payback (Yrs): ${
    item.financials.paybackYears !== undefined
      ? item.financials.paybackYears.toFixed(2)
      : (item.financials.paybackMonths / 12).toFixed(2)
  }`,
  `NPV: ${item.financials.npv ?? 0}`,
  `IRR: ${item.financials.irr ?? 0}`,
  `Run-Rate Savings: ${item.financials.runRateSavings}`,
  "",
  "Benefits",
  `Financial Benefits/Assumptions: ${item.benefits.financialAssumptions || "-"}`,
  `Intangible Benefits/Assumptions: ${item.benefits.intangibleAssumptions || "-"}`,
  "",
  "Dependencies",
  item.dependencies.length > 0 ? item.dependencies.join(", ") : "None"
];

export const generateIntakeSummaryLines = (item: ProjectSubmission) => {
  const financialGrid = ensureFinancialGrid(item.financialGrid);
  const metrics = calculateFinancialMetrics(financialGrid, item.financials);
  const depreciationOfCapitalByYear = calculateDepreciationOfCapitalByYear(financialGrid);
  const netBenefitsByYear = calculateNetBenefitsByYear(financialGrid, item.financials);

  const investment = financialGrid.investment;
  const fiscalYear = financialGrid.commencementFiscalYear;
  const capital = mergeInvestmentCells(
    mergeInvestmentCells(
      mergeInvestmentCells(investment.hardware, investment.software),
      mergeInvestmentCells(investment.consultancyVendor, investment.premisesRealEstate)
    ),
    investment.otherCapital
  );
  const totalInvestment = mergeInvestmentCells(capital, investment.expenses);

  return [
    "STRATEGIC PROJECTS PORTAL - APPROVAL INTAKE SUMMARY",
    `Generated: ${formatDate(new Date().toISOString())}`,
    `Case ID: ${item.id}`,
    `Current Stage / Status: ${item.stage} / ${item.status}`,
    "",
    "A. OVERVIEW",
    "----------",
    `Project Name: ${item.title || "-"}`,
    "Project Description:",
    item.summary || "-",
    "",
    `Financial Benefits and Assumptions: ${item.benefits.financialAssumptions || "-"}`,
    `Intangible Benefits and Assumptions: ${item.benefits.intangibleAssumptions || "-"}`,
    "",
    "B. SPONSOR & TIMELINE",
    "---------------------",
    `Submitter Name: ${item.ownerName || "-"}`,
    `Executive Sponsor: ${item.executiveSponsor || "-"}`,
    `Business Sponsor: ${item.businessSponsor || item.sponsorName || "-"}`,
    `Segment - Unit: ${item.segmentUnit || "-"}`,
    `Start Date: ${formatDate(item.startDate)}`,
    `Closure Date: ${formatDate(item.endDate)}`,
    "",
    "C. CHARACTERISTICS",
    "------------------",
    `Project Theme: ${item.projectTheme || "-"}`,
    `Strategic Objective: ${item.strategicObjective || "-"}`,
    `Project Category: ${item.category || "-"}`,
    `Specific Project Classification Type: ${item.specificClassificationType || "-"}`,
    `Project Classification: ${item.projectClassification || "-"}`,
    `Project Type: ${item.projectType || "-"}`,
    `CIBC Enterprise Project Theme: ${item.enterpriseProjectTheme || "-"}`,
    `Business Unit: ${item.businessUnit || "-"}`,
    "",
    "D. FINANCIALS",
    "-------------",
    `Project Commencement Fiscal: ${fiscalYear}`,
    "",
    "Total Investment (US '000s)",
    formatInvestmentLine("Capital", fiscalYear, capital),
    formatInvestmentLine("Hardware", fiscalYear, investment.hardware),
    formatInvestmentLine("Software", fiscalYear, investment.software),
    formatInvestmentLine("Consultancy/Vendor", fiscalYear, investment.consultancyVendor),
    formatInvestmentLine("Premises/Real Estate", fiscalYear, investment.premisesRealEstate),
    formatInvestmentLine("Other Capital", fiscalYear, investment.otherCapital),
    formatInvestmentLine("Expenses", fiscalYear, investment.expenses),
    formatInvestmentLine("Total Investment", fiscalYear, totalInvestment),
    "",
    "Incremental Revenue & Cost (US '000s)",
    formatYearSeries("Revenue", financialGrid.incremental.years, financialGrid.incremental.revenue),
    formatYearSeries("Saved Costs", financialGrid.incremental.years, financialGrid.incremental.savedCosts),
    formatYearSeries(
      "Additional Operating Costs",
      financialGrid.incremental.years,
      financialGrid.incremental.addlOperatingCosts
    ),
    formatYearSeries("Depreciation of Capital", financialGrid.incremental.years, depreciationOfCapitalByYear),
    formatYearSeries("Net Benefits", financialGrid.incremental.years, netBenefitsByYear),
    "",
    `Payback (Yrs): ${metrics.paybackLabel}`,
    `NPV (14% Discount): ${formatNumber(metrics.npv)}`,
    `IRR (%): ${metrics.irrPct === null ? "N/A" : `${metrics.irrPct.toFixed(2)}%`}`
  ];
};

type PdfFont = "F1" | "F2";
type PdfColor = [number, number, number];

const FORM_PDF_MARGIN_X = 38;
const FORM_PDF_TOP_Y = 742;
const FORM_PDF_BOTTOM_Y = 52;
const FORM_PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - FORM_PDF_MARGIN_X * 2;
const FORM_PDF_ROW_HEIGHT = 20;

const COLOR_BRAND: PdfColor = [176 / 255, 10 / 255, 48 / 255];
const COLOR_TEXT: PdfColor = [30 / 255, 41 / 255, 59 / 255];
const COLOR_MUTED: PdfColor = [71 / 255, 85 / 255, 105 / 255];
const COLOR_TABLE_LINE: PdfColor = [203 / 255, 213 / 255, 225 / 255];
const COLOR_TABLE_HEAD: PdfColor = [241 / 255, 245 / 255, 249 / 255];
const COLOR_TABLE_EMPHASIS: PdfColor = [248 / 255, 250 / 255, 252 / 255];
const COLOR_WHITE: PdfColor = [1, 1, 1];

const rgb = (color: PdfColor) => `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)}`;

const approxTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.52;

const truncateForWidth = (value: string, cellWidth: number, fontSize: number) => {
  const text = normalizePdfText(value);
  const maxChars = Math.max(1, Math.floor((cellWidth - 8) / (fontSize * 0.52)));
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 3)}...`;
};

class IntakePdfComposer {
  private pages: string[][] = [];

  private y = FORM_PDF_TOP_Y;

  private pageNumber = 0;

  private readonly generatedDate: string;

  private readonly caseId: string;

  constructor(caseId: string) {
    this.caseId = caseId;
    this.generatedDate = formatDate(new Date().toISOString());
    this.startPage();
  }

  private current() {
    return this.pages[this.pages.length - 1]!;
  }

  private push(command: string) {
    this.current().push(command);
  }

  private startPage() {
    this.pageNumber += 1;
    this.pages.push([]);
    this.y = FORM_PDF_TOP_Y;

    const barHeight = 30;
    const barY = this.y;
    this.drawFilledRect(FORM_PDF_MARGIN_X, barY - barHeight, FORM_PDF_CONTENT_WIDTH, barHeight, COLOR_BRAND);
    this.drawText("Strategic Projects Portal | Approval Intake Summary", FORM_PDF_MARGIN_X + 10, barY - 20, {
      font: "F2",
      size: 12,
      color: COLOR_WHITE
    });
    this.drawText(`Case ${this.caseId} | Page ${this.pageNumber}`, FORM_PDF_MARGIN_X + FORM_PDF_CONTENT_WIDTH - 150, barY - 20, {
      font: "F1",
      size: 9,
      color: COLOR_WHITE
    });
    this.drawText(`Generated ${this.generatedDate}`, FORM_PDF_MARGIN_X, barY - barHeight - 14, {
      font: "F1",
      size: 9,
      color: COLOR_MUTED
    });

    this.y = barY - barHeight - 24;
  }

  private ensureSpace(height: number) {
    if (this.y - height < FORM_PDF_BOTTOM_Y) {
      this.startPage();
    }
  }

  private drawText(
    text: string,
    x: number,
    y: number,
    options?: { font?: PdfFont; size?: number; color?: PdfColor }
  ) {
    const font = options?.font ?? "F1";
    const size = options?.size ?? 10;
    const color = options?.color ?? COLOR_TEXT;
    this.push(`BT /${font} ${size} Tf ${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`);
  }

  private drawFilledRect(x: number, y: number, width: number, height: number, fill: PdfColor) {
    this.push(`q ${rgb(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f Q`);
  }

  private drawStrokedRect(x: number, y: number, width: number, height: number, stroke: PdfColor, lineWidth = 1) {
    this.push(
      `q ${rgb(stroke)} RG ${lineWidth.toFixed(2)} w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S Q`
    );
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number, stroke: PdfColor, lineWidth = 1) {
    this.push(
      `q ${rgb(stroke)} RG ${lineWidth.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`
    );
  }

  gap(height: number) {
    this.ensureSpace(height + 2);
    this.y -= height;
  }

  sectionTitle(label: string) {
    this.ensureSpace(24);
    this.drawText(label, FORM_PDF_MARGIN_X, this.y, { font: "F2", size: 12, color: COLOR_BRAND });
    this.drawLine(FORM_PDF_MARGIN_X, this.y - 4, FORM_PDF_MARGIN_X + FORM_PDF_CONTENT_WIDTH, this.y - 4, COLOR_TABLE_LINE, 1);
    this.y -= 18;
  }

  line(text: string, options?: { font?: PdfFont; size?: number; color?: PdfColor; lineHeight?: number }) {
    const size = options?.size ?? 10;
    const lineHeight = options?.lineHeight ?? 14;
    this.ensureSpace(lineHeight);
    this.drawText(text, FORM_PDF_MARGIN_X, this.y, {
      font: options?.font ?? "F1",
      size,
      color: options?.color ?? COLOR_TEXT
    });
    this.y -= lineHeight;
  }

  wrapped(text: string, options?: { font?: PdfFont; size?: number; color?: PdfColor; maxWidth?: number; lineHeight?: number }) {
    const size = options?.size ?? 10;
    const maxWidth = options?.maxWidth ?? FORM_PDF_CONTENT_WIDTH;
    const maxChars = Math.max(16, Math.floor(maxWidth / (size * 0.52)));
    const wrapped = wrapLine(text, maxChars);
    wrapped.forEach((line) =>
      this.line(line, {
        font: options?.font,
        size,
        color: options?.color,
        lineHeight: options?.lineHeight
      })
    );
  }

  table(spec: {
    title: string;
    columns: string[];
    rows: string[][];
    columnWidths: number[];
    emphasizedRows?: number[];
  }) {
    const headerAndRows = 1 + spec.rows.length;
    const tableHeight = headerAndRows * FORM_PDF_ROW_HEIGHT;
    const blockHeight = 16 + tableHeight + 10;
    this.ensureSpace(blockHeight);

    this.drawText(spec.title, FORM_PDF_MARGIN_X, this.y, { font: "F2", size: 10, color: COLOR_TEXT });
    this.y -= 12;

    const tableTop = this.y;
    const tableBottom = tableTop - tableHeight;
    const tableX = FORM_PDF_MARGIN_X;

    this.drawFilledRect(tableX, tableTop - FORM_PDF_ROW_HEIGHT, FORM_PDF_CONTENT_WIDTH, FORM_PDF_ROW_HEIGHT, COLOR_TABLE_HEAD);
    (spec.emphasizedRows ?? []).forEach((rowIndex) => {
      const y = tableTop - (rowIndex + 2) * FORM_PDF_ROW_HEIGHT;
      this.drawFilledRect(tableX, y, FORM_PDF_CONTENT_WIDTH, FORM_PDF_ROW_HEIGHT, COLOR_TABLE_EMPHASIS);
    });

    this.drawStrokedRect(tableX, tableBottom, FORM_PDF_CONTENT_WIDTH, tableHeight, COLOR_TABLE_LINE, 1);

    let cursorX = tableX;
    spec.columnWidths.forEach((width, index) => {
      if (index > 0) {
        this.drawLine(cursorX, tableBottom, cursorX, tableTop, COLOR_TABLE_LINE, 1);
      }
      cursorX += width;
    });

    for (let i = 1; i < headerAndRows; i += 1) {
      const y = tableTop - i * FORM_PDF_ROW_HEIGHT;
      this.drawLine(tableX, y, tableX + FORM_PDF_CONTENT_WIDTH, y, COLOR_TABLE_LINE, 1);
    }

    const rowsWithHeader = [spec.columns, ...spec.rows];
    rowsWithHeader.forEach((row, rowIndex) => {
      let x = tableX;
      row.forEach((rawCell, colIndex) => {
        const cellWidth = spec.columnWidths[colIndex] ?? 80;
        const font: PdfFont = rowIndex === 0 || (spec.emphasizedRows ?? []).includes(rowIndex - 1) ? "F2" : "F1";
        const size = rowIndex === 0 ? 9 : 8.8;
        const cellText = truncateForWidth(rawCell, cellWidth, size);
        const rowTop = tableTop - rowIndex * FORM_PDF_ROW_HEIGHT;
        const rowBottom = rowTop - FORM_PDF_ROW_HEIGHT;
        const baseline = rowBottom + (FORM_PDF_ROW_HEIGHT - size) / 2 + 2;
        if (colIndex === 0) {
          this.drawText(cellText, x + 4, baseline, { font, size, color: COLOR_TEXT });
        } else {
          const textWidth = approxTextWidth(cellText, size);
          const textX = x + Math.max(2, (cellWidth - textWidth) / 2);
          this.drawText(cellText, textX, baseline, { font, size, color: COLOR_TEXT });
        }
        x += cellWidth;
      });
    });

    this.y = tableBottom - 10;
  }

  streams() {
    return this.pages.map((commands) => commands.join("\n"));
  }
}

const buildPdfFromStreams = (streams: string[]) => {
  const objectBodies: string[] = [];
  const addObject = (body: string) => {
    objectBodies.push(body);
    return objectBodies.length;
  };

  const catalogRef = addObject("");
  const pagesRef = addObject("");
  const fontRegularRef = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldRef = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageRefs: string[] = [];

  streams.forEach((stream) => {
    const contentRef = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream`);
    const pageRef = addObject(
      `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularRef} 0 R /F2 ${fontBoldRef} 0 R >> >> /Contents ${contentRef} 0 R >>`
    );
    pageRefs.push(`${pageRef} 0 R`);
  });

  objectBodies[catalogRef - 1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
  objectBodies[pagesRef - 1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objectBodies.forEach((body, index) => {
    const objectNumber = index + 1;
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${objectNumber} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objectBodies.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objectBodies.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objectBodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
};

export const generateIntakeSummaryPdf = (item: ProjectSubmission) => {
  const financialGrid = ensureFinancialGrid(item.financialGrid);
  const metrics = calculateFinancialMetrics(financialGrid, item.financials);
  const depreciationOfCapitalByYear = calculateDepreciationOfCapitalByYear(financialGrid);
  const netBenefitsByYear = calculateNetBenefitsByYear(financialGrid, item.financials);

  const investment = financialGrid.investment;
  const fiscalYear = financialGrid.commencementFiscalYear;
  const capital = mergeInvestmentCells(
    mergeInvestmentCells(
      mergeInvestmentCells(investment.hardware, investment.software),
      mergeInvestmentCells(investment.consultancyVendor, investment.premisesRealEstate)
    ),
    investment.otherCapital
  );
  const totalInvestment = mergeInvestmentCells(capital, investment.expenses);

  const composer = new IntakePdfComposer(item.id);

  composer.sectionTitle("A. Overview");
  composer.wrapped(`Project Name: ${item.title || "-"}`, { font: "F2", size: 10 });
  composer.wrapped(`Project Description: ${item.summary || "-"}`, { size: 10 });
  composer.wrapped(`Financial Benefits and Assumptions: ${item.benefits.financialAssumptions || "-"}`, { size: 10 });
  composer.wrapped(`Intangible Benefits and Assumptions: ${item.benefits.intangibleAssumptions || "-"}`, { size: 10 });
  composer.gap(4);

  composer.sectionTitle("B. Sponsor & Timeline");
  composer.line(`Submitter Name: ${item.ownerName || "-"}`);
  composer.line(`Executive Sponsor: ${item.executiveSponsor || "-"}`);
  composer.line(`Business Sponsor: ${item.businessSponsor || item.sponsorName || "-"}`);
  composer.line(`Segment - Unit: ${item.segmentUnit || "-"}`);
  composer.line(`Start Date: ${formatDate(item.startDate)}`);
  composer.line(`Closure Date: ${formatDate(item.endDate)}`);
  composer.gap(4);

  composer.sectionTitle("C. Characteristics");
  composer.line(`Project Theme: ${item.projectTheme || "-"}`);
  composer.line(`Strategic Objective: ${item.strategicObjective || "-"}`);
  composer.line(`Project Category: ${item.category || "-"}`);
  composer.line(`Specific Project Classification Type: ${item.specificClassificationType || "-"}`);
  composer.line(`Project Classification: ${item.projectClassification || "-"}`);
  composer.line(`Project Type: ${item.projectType || "-"}`);
  composer.line(`CIBC Enterprise Project Theme: ${item.enterpriseProjectTheme || "-"}`);
  composer.line(`Business Unit: ${item.businessUnit || "-"}`);
  composer.gap(4);

  composer.sectionTitle("D. Financials");
  composer.line(`Project Commencement Fiscal: ${fiscalYear}`, { font: "F2" });
  composer.gap(3);

  const investmentRows = [
    ["Capital", formatNumber(capital.priorYears), formatNumber(capital.currentFiscal), formatNumber(capital.future), formatNumber(investmentLifeTotal(capital))],
    ["Hardware", formatNumber(investment.hardware.priorYears), formatNumber(investment.hardware.currentFiscal), formatNumber(investment.hardware.future), formatNumber(investmentLifeTotal(investment.hardware))],
    ["Software", formatNumber(investment.software.priorYears), formatNumber(investment.software.currentFiscal), formatNumber(investment.software.future), formatNumber(investmentLifeTotal(investment.software))],
    ["Consultancy/Vendor", formatNumber(investment.consultancyVendor.priorYears), formatNumber(investment.consultancyVendor.currentFiscal), formatNumber(investment.consultancyVendor.future), formatNumber(investmentLifeTotal(investment.consultancyVendor))],
    ["Premises/Real Estate", formatNumber(investment.premisesRealEstate.priorYears), formatNumber(investment.premisesRealEstate.currentFiscal), formatNumber(investment.premisesRealEstate.future), formatNumber(investmentLifeTotal(investment.premisesRealEstate))],
    ["Other Capital", formatNumber(investment.otherCapital.priorYears), formatNumber(investment.otherCapital.currentFiscal), formatNumber(investment.otherCapital.future), formatNumber(investmentLifeTotal(investment.otherCapital))],
    ["Expenses", formatNumber(investment.expenses.priorYears), formatNumber(investment.expenses.currentFiscal), formatNumber(investment.expenses.future), formatNumber(investmentLifeTotal(investment.expenses))],
    ["Total Investment", formatNumber(totalInvestment.priorYears), formatNumber(totalInvestment.currentFiscal), formatNumber(totalInvestment.future), formatNumber(investmentLifeTotal(totalInvestment))]
  ];

  composer.table({
    title: "Total Investment (US '000s)",
    columns: ["Line Item", "Prior Yrs", `F${fiscalYear}`, "Future", "Life"],
    rows: investmentRows,
    columnWidths: [208, 80, 80, 80, 80],
    emphasizedRows: [0, 6, 7]
  });

  const incrementalRows = [
    ["Revenue", ...financialGrid.incremental.revenue.map((value) => formatNumber(value))],
    ["Saved Costs", ...financialGrid.incremental.savedCosts.map((value) => formatNumber(value))],
    ["Additional Operating Costs", ...financialGrid.incremental.addlOperatingCosts.map((value) => formatNumber(value))],
    ["Depreciation of Capital", ...depreciationOfCapitalByYear.map((value) => formatNumber(value))],
    ["Net Benefits", ...netBenefitsByYear.map((value) => formatNumber(value))]
  ];

  composer.table({
    title: "Incremental Revenue & Cost (US '000s)",
    columns: ["Line Item", ...financialGrid.incremental.years.map((year) => `F${year}`)],
    rows: incrementalRows,
    columnWidths: [188, 68, 68, 68, 68, 68],
    emphasizedRows: [4]
  });

  composer.line(`Payback (Yrs): ${metrics.paybackLabel}`, { font: "F2", size: 10, color: COLOR_BRAND });
  composer.line(`NPV (14% Discount): ${formatNumber(metrics.npv)}`, { font: "F2", size: 10, color: COLOR_BRAND });
  composer.line(`IRR (%): ${metrics.irrPct === null ? "N/A" : `${metrics.irrPct.toFixed(2)}%`}`, {
    font: "F2",
    size: 10,
    color: COLOR_BRAND
  });

  return buildPdfFromStreams(composer.streams());
};

export const generatePptOutline = (rows: ProjectSubmission[]) => {
  const lines = [
    "Strategic Projects Executive Deck",
    "",
    "Slide 1: Portfolio Overview",
    `- Total Projects: ${rows.length}`,
    `- Approved: ${rows.filter((r) => r.status === "Approved").length}`,
    `- Sent for Approval: ${rows.filter((r) => r.status === "Sent for Approval").length}`,
    "",
    "Slide 2: Financial Snapshot"
  ];

  rows.slice(0, 8).forEach((row) => {
    lines.push(`- ${row.id} ${row.title}: Savings $${row.financials.runRateSavings.toLocaleString()} | Status ${row.status}`);
  });

  lines.push("", "Slide 3: Risks & Actions", "- Focus on projects returned to submitter and rejected for remediation.");
  return lines.join("\n");
};
