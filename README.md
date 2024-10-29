
# eCommerce Backend API

## Environment Variables

To run this project, you will need to add the following environment variables to your *.env* file in root directory.

```
ACCESS_TOKEN_SECRET=<Your secret key>
DATABASE_URI_TEST=<Test MongoDB connection url>
DATABASE_URI_LIVE=<Live MongoDB connection url>
FRONTEND_URL=<Url where frontend is hosted>
MODE=development
PORT=<Desired port number>
RAZORPAY_ID_TEST=<Test razorpay id>
RAZORPAY_SECRET_TEST=<Test razorpay secret>
RAZORPAY_ID_LIVE=<Live razorpay id>
RAZORPAY_SECRET_LIVE=<Live razorpay secret>
AWS_S3_BUCKET_NAME=<Your s3 bucket name>
AWS_ACCESS_KEY_ID=<Your AWS access key id>
AWS_SECRET_ACCESS_KEY=<Your AWS secret key>
AWS_REGION=<Your AWS region>
```


## Run Locally

Install dependencies

```bash
  npm install
```

Start the server

```bash
  npm run dev
```

