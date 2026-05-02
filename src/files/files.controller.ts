import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { AppException } from '../common/exceptions/app.exception';

const maxUploadBytes = Number(
  process.env.FILE_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024,
);

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  findAll() {
    return this.filesService.findAll();
  }

  @Get('download')
  async download(
    @Query('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.filesService.download(key);

    res.set({
      'Content-Type': file.contentType,
      'Content-Length': file.contentLength,
      'Content-Disposition': file.contentDisposition,
      'Cache-Control': 'no-store, no-transform',
    });

    return new StreamableFile(file.buffer);
  }

  @Delete()
  remove(@Query('key') key: string) {
    return this.filesService.remove(key);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: maxUploadBytes })],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new AppException(
        'File is required',
        HttpStatus.BAD_REQUEST,
        'FILE_REQUIRED',
      );
    }

    return this.filesService.upload(file);
  }
}
