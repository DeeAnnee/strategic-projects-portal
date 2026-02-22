import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      message: "Sponsor decisions are handled only in the Approvals section. Open Approvals > Sent To Me."
    },
    { status: 410 }
  );
}
