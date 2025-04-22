# kursi-project
To run this project, follow the below instructions:-
git clone this project.

then create .env folder in the backend and paste your AWS IAM credentials such as:-
AWS_ACCESS_KEY_ID=<Access-Key>
AWS_SECRET_ACCESS_KEY=<Secret-access-keys>

then in the terminal make sure pwd is backend folder,
run- npm install in the terminal and then nodemon server.js

then in frontend folder (pwd) run:-
npm install -g http-server
Serve on port 5500:
http-server -p 5500

or (install python)
run:-
cd frontend
python3 -m http.server 5500


Now both the frontend and backend is running. but before running you need to ensure that for email otp_verification, follow the instructions given in /Lambda_email_verification/email_verification.py to setup API Gateway and Lambda function in AWS.

After that create S3 bucket with name:- kursi-test-media711 (general purpose) and then inside it create two folders:-
user-media-posts/
userphotos/
with Block public access disabled (all) and CORS:-
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "PUT",
            "POST"
        ],
        "AllowedOrigins": [
            "*"
        ],
        "ExposeHeaders": [],
        "MaxAgeSeconds": 3000
    }
]

and Bucket_Policy:-
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPublicReadAccessToUserPhotos",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::kursi-test-media711/*"
        },
        {
            "Sid": "AllowDeleteAccessToUserPhotos",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:DeleteObject",
            "Resource": "arn:aws:s3:::kursi-test-media711/*"
        }
    ]
}

Also create three DynamoDB tables:-
user-details with Partition Key userId (Key Index) and in Indexes section set Global secondary indexes (GSI) as email (email-index)
userStories:- with Partition Key storyId (Key Index) and in Indexes section set GSI as storyId-index.
user-stories-comments:- with Partition Key commentId (Key Index) and set GSI as storyId (storyId-Index)

That's it run the application like a champ.
