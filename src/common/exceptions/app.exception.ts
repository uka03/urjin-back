import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(message: string, status: HttpStatus, code?: string) {
    super(
      {
        success: false,
        message,
        ...(code ? { error: { code } } : {}),
      },
      status,
    );
  }
}
