import { HttpStatus, Injectable } from '@nestjs/common';
import {
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
          CacheControl: `public, max-age=${oneDaySeconds}, immutable`,
          Metadata: {
            originalName: Buffer.from(file.originalname, 'latin1').toString(
              'utf8',
            ),
            expiresAt: expiresAt.toISOString(),
          },
        }),
      );

      return {
        key,
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

  private createObjectKey(originalName: string) {
    const extension = extname(originalName).toLowerCase();
    const datePrefix = new Date().toISOString().slice(0, 10);

    return `uploads/${datePrefix}/${randomUUID()}${extension}`;
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
