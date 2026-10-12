export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export function errorResponse(
  code: ErrorCode,
  message: string,
): ErrorBody {
  return { error: { code, message } };
}

export function unauthorized(): ErrorBody {
  return errorResponse(
    "UNAUTHORIZED",
    "Login diperlukan. Silakan masuk kembali.",
  );
}

export function wrongPassword(): ErrorBody {
  return errorResponse("UNAUTHORIZED", "Kata sandi salah.");
}

export function tooManyAttempts(): ErrorBody {
  return errorResponse(
    "RATE_LIMITED",
    "Terlalu banyak percobaan masuk. Coba lagi sebentar.",
  );
}
