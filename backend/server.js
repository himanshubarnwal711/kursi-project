require('dotenv').config();
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

AWS.config.update({ region: 'ap-south-1' });

const s3 = new AWS.S3();
const dynamo = new AWS.DynamoDB.DocumentClient();

const storage = multer.memoryStorage(); // We'll compress before uploading
const upload = multer({ storage });
const sharp = require('sharp');

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Temporary in-memory store for OTPs
const otpStore = {};

// Proxy API to send OTP
app.post('/send-otp', async (req, res) => {
  const { userEmail } = req.body;

  try {
    // Call the actual Lambda endpoint
    const response = await axios.post(
      'https://3xrq3qfhwf.execute-api.ap-south-1.amazonaws.com/dev/verify',
      { userEmail },
      { headers: { 'Content-Type': 'application/json' } }
    );

    // Check the response from Lambda
    if (response.data && response.data.otp) {
      const otp = response.data.otp; // Extract OTP from Lambda response

      // Store OTP temporarily with expiration time
      otpStore[userEmail] = {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000 // Expires in 5 mins
      };

      console.log(`Stored OTP for ${userEmail}: ${otp}`);
      return res.status(200).send({
        message: `OTP sent successfully to ${userEmail}`,
        otp // Send the OTP back in response (use with caution in production)
      });
    } else {
      // In case the response does not contain the OTP
      throw new Error('OTP not found in Lambda response');
    }
  } catch (error) {
    console.error("Error proxying OTP request:", error.message);
    res.status(500).send({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
app.post('/verify-otp', (req, res) => {
  const { userEmail, otp } = req.body;
  const record = otpStore[userEmail];

  if (!record) {
    return res.status(400).send({ success: false, message: 'No OTP found for this email.' });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[userEmail];
    return res.status(400).send({ success: false, message: 'OTP expired.' });
  }

  if (record.otp === otp) {
    delete otpStore[userEmail]; // Optional: clear after successful verification
    return res.send({ success: true, message: 'OTP verified successfully!' });
  }

  return res.status(400).send({ success: false, message: 'Invalid OTP.' });
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});


app.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const {
      name, gender, email, dob,
      city, country, password, about
    } = req.body;

    // STEP 1: Check if email already exists
    const existingUser = await dynamo.query({
      TableName: 'user-details',
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }).promise();

    if (existingUser.Items.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered. Please use another email.' });
    }

    // STEP 2: Continue normal registration
    const userId = uuidv4();
    const encryptedPassword = await bcrypt.hash(password, 10);

    const compressedBuffer = await sharp(req.file.buffer)
      .resize({ width: 500 })
      .jpeg({ quality: 80 })
      .toBuffer();

    if (compressedBuffer.length > 1 * 1024 * 1024) {
      return res.status(400).json({ error: "Image too large after compression." });
    }

    const s3Key = `userphotos/${userId}/selfie.jpg`;

    const s3Result = await s3.upload({
      Bucket: 'kursi-test-media711',
      Key: s3Key,
      Body: compressedBuffer,
      ContentType: 'image/jpeg'
    }).promise();

    const photoUrl = s3Result.Location;

    const userItem = {
      userId,
      name,
      gender,
      email,
      dob,
      city,
      country,
      password: encryptedPassword,
      about,
      photoUrl
    };

    await dynamo.put({
      TableName: 'user-details',
      Item: userItem
    }).promise();

    res.status(201).json({ success: true, userId });

  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

const comparePasswords = (plain, hash) => bcrypt.compare(plain, hash);

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await dynamo.query({
      TableName: 'user-details',
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :e',
      ExpressionAttributeValues: {
        ':e': email
      }
    }).promise();

    if (result.Items.length === 0) {
      return res.status(401).json({ success: false, message: 'Email not found' });
    }

    const user = result.Items[0];
    const isValid = await comparePasswords(password, user.password);

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    res.status(200).json({ success: true, userId: user.userId });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await dynamo.get({
      TableName: 'user-details',
      Key: { userId }
    }).promise();

    if (!result.Item) {
      return res.status(404).json({ error: "User not found" });
    }

    const { name, email, photoUrl, city, about, country } = result.Item;
    res.json({ name, email, photoUrl, city, aboutMe: about, country });

  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put('/update-password/:userId', async (req, res) => {
  const { userId } = req.params;
  const { currentPassword, newPassword } = req.body;

  try {
    // 1. Get user from DB
    const userRes = await dynamo.get({
      TableName: 'user-details',
      Key: { userId }
    }).promise();

    if (!userRes.Item) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // 2. Compare current password
    const isMatch = await bcrypt.compare(currentPassword, userRes.Item.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect current password' });
    }

    // 3. Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // 4. Update password in DynamoDB
    await dynamo.update({
      TableName: 'user-details',
      Key: { userId },
      UpdateExpression: 'set #pwd = :p',
      ExpressionAttributeNames: {
        '#pwd': 'password'
      },
      ExpressionAttributeValues: {
        ':p': hashedNewPassword
      }
    }).promise();

    res.json({ success: true, message: 'Password updated successfully' });

  } catch (err) {
    console.error("Password update error:", err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ADD THIS AT THE END OF YOUR EXISTING server.js FILE

app.post('/post-story', upload.single('photo'), async (req, res) => {
  try {
    const { userId, storyText } = req.body;

    if (!userId || !storyText) {
      return res.status(400).json({ success: false, message: 'userId and storyText are required' });
    }

    const storyId = uuidv4();
    const dateTime = new Date().toISOString();
    let photoUrl = null;

    // Handle optional photo
    if (req.file) {
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'Image size must be <= 5MB' });
      }

      const buffer = await sharp(req.file.buffer)
        .resize({ width: 1024 })
        .jpeg({ quality: 85 })
        .toBuffer();

      const s3Key = `user-media-posts/${userId}/${storyId}/story.jpg`;

      const uploadResult = await s3.upload({
        Bucket: 'kursi-test-media711',
        Key: s3Key,
        Body: buffer,
        ContentType: 'image/jpeg'
      }).promise();

      photoUrl = uploadResult.Location;
    }

    // Save story in DynamoDB
    await dynamo.put({
      TableName: 'userStories',
      Item: {
        storyId,
        userId,
        storyText,
        photoUrl,
        dateTime
      }
    }).promise();

    res.status(201).json({ success: true, message: 'Story posted successfully', storyId });

  } catch (err) {
    console.error('Error posting story:', err);
    res.status(500).json({ success: false, message: 'Failed to post story' });
  }
});

app.get('/get-stories', async (req, res) => {
  try {
    const data = await dynamo.scan({ TableName: 'userStories' }).promise();

    const userIdSet = new Set(data.Items.map(item => item.userId));

    // Fetch user details in parallel using Promise.all
    const userDetailsArray = await Promise.all(
      Array.from(userIdSet).map(userId =>
        dynamo.get({
          TableName: 'user-details',
          Key: { userId }
        }).promise().then(userData => ({
          userId,
          name: userData.Item?.name || 'Unknown',
          photoUrl: userData.Item?.photoUrl || null
        }))
      )
    );

    // Build map of userId to user details
    const userDetailsMap = {};
    userDetailsArray.forEach(user => {
      userDetailsMap[user.userId] = {
        name: user.name,
        photoUrl: user.photoUrl
      };
    });

    // Attach user info to each story
    const storiesWithUserInfo = data.Items.map(story => ({
      ...story,
      username: userDetailsMap[story.userId]?.name || 'Unknown',
      userPhoto: userDetailsMap[story.userId]?.photoUrl || null
    }));

    // console.log("Fetched stories with user info:", storiesWithUserInfo); // <- Debugging
    res.json(storiesWithUserInfo);
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

app.delete('/story/:id', async (req, res) => {
  const storyId = req.params.id;

  try {
    // First: Get story from DynamoDB (assuming you query by GSI on storyId)
    const result = await dynamo.query({
      TableName: 'userStories',
      IndexName: 'storyId-index', // Replace with your actual GSI name
      KeyConditionExpression: 'storyId = :storyIdVal',
      ExpressionAttributeValues: {
        ':storyIdVal': storyId,
      },
    }).promise();

    const item = result.Items[0];
    if (!item) return res.status(404).json({ message: 'Story not found' });

    const { userId } = item;

    // Second: Delete the story from DynamoDB
    await dynamo.delete({
      TableName: 'userStories',
      Key: {
        storyId: storyId
      }
    }).promise();

    // Third: Delete the S3 folder (all objects under the storyId path)
    const listObjects = await s3.listObjectsV2({
      Bucket: 'kursi-test-media711',
      Prefix: `user-media-posts/${userId}/${storyId}/`,
    }).promise();

    if (listObjects.Contents.length > 0) {
      const deleteParams = {
        Bucket: 'kursi-test-media711',
        Delete: {
          Objects: listObjects.Contents.map(obj => ({ Key: obj.Key }))
        }
      };
      await s3.deleteObjects(deleteParams).promise();
    }

    res.status(200).json({ message: 'Story deleted successfully' });

  } catch (err) {
    console.error('Error deleting story:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch comments for a specific story
app.get('/get-comments/:storyId', async (req, res) => {
    const { storyId } = req.params;

    const params = {
        TableName: 'user-stories-comments',
        IndexName: 'storyId-index',  // If using a secondary index for storyId
        KeyConditionExpression: 'storyId = :storyId',
        ExpressionAttributeValues: {
            ':storyId': storyId
        },
        ScanIndexForward: true  // Sort by dateTime ascending (newest last)
    };

    try {
        const result = await dynamo.query(params).promise();
        const comments = result.Items;

        // Retrieve user details for each comment
        const enrichedComments = await Promise.all(comments.map(async (comment) => {
            const userParams = {
                TableName: 'user-details',
                Key: { userId: comment.userId }
            };
            const userResult = await dynamo.get(userParams).promise();
            const user = userResult.Item;

            return {
                ...comment,
                userName: user.name,
                userPhoto: user.photoUrl,  // Assuming you store photoUrl
                dateTime: new Date(comment.dateTime).toLocaleString()
            };
        }));

        res.json(enrichedComments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).send('Error fetching comments');
    }
});

// Add a comment
app.post('/add-comment', async (req, res) => {
    const { storyId, comment, userId } = req.body;

    if (!comment || !userId || !storyId) {
        return res.status(400).send('Invalid input');
    }

    const commentId = uuidv4();  // Generate a unique ID for the comment
    const dateTime = new Date().toISOString();

    const params = {
        TableName: 'user-stories-comments',
        Item: {
            commentId,
            userId,
            storyId,
            dateTime,
            comment
        }
    };

    try {
        await dynamo.put(params).promise();
        res.json({ commentId, userId, storyId, dateTime, comment });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).send('Error adding comment');
    }
});
