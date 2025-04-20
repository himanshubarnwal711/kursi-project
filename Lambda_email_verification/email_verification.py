import os
import json
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# After deploying the Lambda function, set the environment variables:
# - sender_email: Your Gmail address
# - app_password: Your Gmail app password (not your Gmail password)
# Note: Make sure to set the environment variables in your Lambda function configuration
# and not hardcode them in the code for security reasons.
# This code is for sending OTP via email using AWS Lambda and Gmail SMTP.

# Also trigger the Lambda function using API Gateway with POST method
# After creating REST API in AWS API Gateway, you can set up a POST method by creating a resource /verify and then deploy it in dev (Choose:- New Stage).
# Make sure to enable CORS in API Gateway for the POST method to allow cross-origin requests.
# Then link the Lambda function to the POST method in API Gateway.
# Test it by giving body in the request as: { "userEmail": "test@example.com" }
# After that copy the ARN of the POST method "arn:aws:execute-api:ap-south-1:460264892221:3xrq3qfhwf/*/POST/verify"
# and use it in your backend->server.js->app.post('/send-otp') method code to call the API.

def lambda_handler(event, context):
    try:
        # Extract and parse body
        body = json.loads(event.get('body', '{}'))
        userEmail = body.get('userEmail', 'User')
        
        # Generate 6-digit OTP
        OTP = ''.join(random.choices("0123456789", k=6))
        
        # Compose email
        sender_email = os.environ.get('sender_email')
        app_password = os.environ.get('app_password')  # App password
        subject = "Your One Time Verification Code"
        
        # Text message
        message_text = f"Hi {userEmail}, This is your One Time Verification Code {OTP}. Please enter this code to verify your email."

        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = userEmail
        msg['Subject'] = subject
        msg.attach(MIMEText(message_text, 'plain'))

        # Send the email via Gmail SMTP
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, app_password)
        server.send_message(msg)
        server.quit()

        print("Email sent successfully to:", userEmail)

        # Return OTP in response (avoid exposing OTP in production)
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                "message": f"OTP sent successfully to {userEmail}",
                "otp": OTP  # Returning the OTP in the response
            })
        }

    except Exception as e:
        print("Error occurred:", e)
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps(f"Failed to send OTP: {str(e)}")
        }
