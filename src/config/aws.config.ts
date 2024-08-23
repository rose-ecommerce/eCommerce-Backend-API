import AWS from 'aws-sdk';

export const connectToAWS = (): void => {
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION
  } = <Record<string, string>>process.env;

  AWS.config.update({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION
  });
};

export const s3 = new AWS.S3();
