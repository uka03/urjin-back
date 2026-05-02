import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { AppException } from '../common/exceptions/app.exception';

const oneDaySeconds = 24 * 60 * 60;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
};

@Injectable()
export class FilesService {
  private config?: R2Config;
  private client?: S3Client;

  async findAll() {
    const config = this.getConfig();
    const response = await this.getClient(config).send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: 'uploads/',
      }),
    );

    return (response.Contents ?? [])
      .filter((object) => object.Key)
      .map((object) => {
        const uploadedAt = object.LastModified ?? new Date();
        const expiresAt = new Date(uploadedAt.getTime() + oneDaySeconds * 1000);
        const key = object.Key!;

        return {
          key,
          fileName: key.split('/').pop() ?? key,
          url: `${config.publicUrl}/${key}`,
          size: object.Size ?? 0,
          uploadedAt: uploadedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          ttlSeconds: Math.max(
            0,
            Math.floor((expiresAt.getTime() - Date.now()) / 1000),
          ),
        };
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  async upload(file: Express.Multer.File) {
    try {
      const config = this.getConfig();
      const key = this.createObjectKey(file.originalname);
      const expiresAt = new Date(Date.now() + oneDaySeconds * 1000);
      console.log('Uploading file to R2 with key:', key);
      console.log('File details:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });

      await this.getClient(config).send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentLength: file.size,
          CacheControl: `public, max-age=${oneDaySeconds}, immutable, no-transform`,
          Metadata: {
            originalName: this.toUtf8FileName(file.originalname),
            expiresAt: expiresAt.toISOString(),
          },
        }),
      );

      return {
        key,
        fileName: this.toUtf8FileName(file.originalname),
        url: `${config.publicUrl}/${key}`,
        expiresAt: expiresAt.toISOString(),
        ttlSeconds: oneDaySeconds,
      };
    } catch (error) {
      console.log('Error uploading file to R2:', error);
      throw new AppException(
        'Failed to upload file',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'FILE_UPLOAD_FAILED',
      );
    }
  }

  async download(key: string) {
    this.assertValidKey(key);

    try {
      const config = this.getConfig();
      const response = await this.getClient(config).send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new AppException(
          'File not found',
          HttpStatus.NOT_FOUND,
          'FILE_NOT_FOUND',
        );
      }

      const bytes = await response.Body.transformToByteArray();
      const buffer = Buffer.from(bytes);
      const fileName =
        response.Metadata?.originalname ??
        response.Metadata?.originalName ??
        this.getFileNameFromKey(key);

      return {
        buffer,
        contentType: response.ContentType ?? 'application/octet-stream',
        contentLength: String(response.ContentLength ?? buffer.length),
        contentDisposition: this.createAttachmentHeader(fileName),
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      console.log('Error downloading file from R2:', error);
      throw new AppException(
        'Failed to download file',
        HttpStatus.INTERNAL_SERVER_ERROR,
        'FILE_DOWNLOAD_FAILED',
      );
    }
  }

  async remove(key: string) {
    this.assertValidKey(key);

    const config = this.getConfig();
    await this.getClient(config).send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );

    return { key };
  }

  private createObjectKey(originalName: string) {
    const extension = extname(originalName).toLowerCase();
    const datePrefix = new Date().toISOString().slice(0, 10);

    return `uploads/${datePrefix}/${randomUUID()}${extension}`;
  }

  private getFileNameFromKey(key: string) {
    return key.split('/').pop() ?? 'download';
  }

  private assertValidKey(key: string) {
    if (!key || !key.startsWith('uploads/') || key.includes('..')) {
      throw new AppException(
        'Invalid file key',
        HttpStatus.BAD_REQUEST,
        'INVALID_FILE_KEY',
      );
    }
  }

  private toUtf8FileName(fileName: string) {
    return Buffer.from(fileName, 'latin1').toString('utf8');
  }

  private createAttachmentHeader(fileName: string) {
    const cleanFileName = fileName.replace(/["\r\n]/g, '').trim() || 'download';
    const asciiName = cleanFileName.replace(/[^\x20-\x7E]/g, '_');

    return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cleanFileName)}`;
  }

  private getClient(config: R2Config) {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        region: 'auto',
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    }

    return this.client;
  }

  private getConfig(): R2Config {
    if (this.config) {
      return this.config;
    }

    const config = {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      publicUrl: process.env.R2_PUBLIC_URL,
    };

    const missing = Object.entries(config)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length) {
      throw new AppException(
        `Missing R2 config: ${missing.join(', ')}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'R2_CONFIG_MISSING',
      );
    }

    this.config = config as R2Config;

    return this.config;
  }
}
