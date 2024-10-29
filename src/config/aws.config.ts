import AWS from 'aws-sdk';

import {
  EnvironmentInterface
} from '../api/v1/shared';

export const connectToAWS = (): void => {
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION
  } = process.env as unknown as EnvironmentInterface;

  AWS.config.update({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION
  });
};

export const s3 = new AWS.S3();
