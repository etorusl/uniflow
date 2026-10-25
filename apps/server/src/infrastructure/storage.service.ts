import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ENVIRONMENT, type Environment } from './environment.js';

@Injectable()
export class StorageService implements OnModuleDestroy {
  readonly client: S3Client;
  constructor(@Inject(ENVIRONMENT) readonly env: Environment) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      maxAttempts: 2,
    });
  }
  async check() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }), {
      abortSignal: AbortSignal.timeout(4000),
    });
  }
  async initializeBucket() {
    try {
      await this.check();
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode !== 404)
        throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.env.S3_BUCKET }));
    }
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
