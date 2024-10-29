import mongoose, { Connection } from 'mongoose';

import {
  EnvironmentInterface
} from '../api/v1/shared';

export const connectToDatabase = async (): Promise<Connection> => {
  const {
    MODE,
    DATABASE_URI_LIVE,
    DATABASE_URI_TEST
  } = process.env as unknown as EnvironmentInterface;
  let DATABASE_URI = DATABASE_URI_TEST;
  if (MODE === 'production') {
    DATABASE_URI = DATABASE_URI_LIVE;
  }
  const { connection } = await mongoose.connect(DATABASE_URI);
  console.log(`MongoDM connected: ${connection.host}`.green.bold)
  return connection;
};