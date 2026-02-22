import { NextResponse } from "next/server";

import { isDataStorePersistenceError } from "@/lib/storage/json-file";

export const persistenceErrorResponse = (error: unknown, fallbackMessage: string) => {
  if (isDataStorePersistenceError(error)) {
    return NextResponse.json(
      {
        message: error.message,
        code: error.code
      },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      message: fallbackMessage,
      code: "INTERNAL_SERVER_ERROR"
    },
    { status: 500 }
  );
};

