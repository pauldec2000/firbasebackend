
const express = require('express');
const admin = require('firebase-admin');
const bodyParser=require('body-parser')
require('dotenv').config();
const path=require('path')


// const serviceAccount = require('./callingnotification-1ec06-firebase-adminsdk-fbsvc-62a3c13fcc.json');
// // const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_CONFIG_BASE64, 'base64').toString('utf-8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db=admin.firestore()

const app=express();
const PORT=4000;

app.use(bodyParser.json());

// API to add a topic directly to Firestore
app.post('/add-topic', async (req, res) => {
    const { topic } = req.body;

    if (!topic) {
        return res.status(400).json({ success: false, message: "Topic name is required." });
    }

    const topicRef = db.collection('topics').doc(topic);

    try {
        const doc = await topicRef.get();

        if (doc.exists) {
            return res.status(200).json({ success: true, message: "Topic already exists." });
        }

        await topicRef.set({
            topic,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Topic "${topic}" added successfully.`);
        res.status(201).json({ success: true, message: `Topic "${topic}" added successfully.` });
    } catch (error) {
        console.error('❌ Error adding topic:', error);
        res.status(500).json({ success: false, message: "Error adding topic.", error: error.message });
    }
});

// API to get the list of all topics
app.get('/get-topics', async (req, res) => {
    try {
        const topicsSnapshot = await db.collection('topics').orderBy('createdAt', 'desc').get();

        if (topicsSnapshot.empty) {
            return res.status(200).json({ success: true, topics: [], message: "No topics found." });
        }

        const topicsList = topicsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json({ success: true, topics: topicsList });
    } catch (error) {
        console.error('❌ Error fetching topics:', error);
        res.status(500).json({ success: false, message: "Error fetching topics.", error: error.message });
    }
});

// Existing send-notification API
app.post('/send-notification', async (req, res) => {
    const { senderMobile, receiverMobile, title, body } = req.body;

    if (!senderMobile || !receiverMobile || !title || !body) {
        return res.status(400).json({ success: false, message: "Sender mobile, receiver mobile, title, and body are required." });
    }

    try {
        // Retrieve the current sender's FCM token from Firestore using sender's mobile number
        const senderRef = db.collection('users').doc(senderMobile);
        const senderDoc = await senderRef.get();

        if (!senderDoc.exists) {
            return res.status(404).json({ success: false, message: "Sender not found." });
        }

        const senderData = senderDoc.data();
        const senderFcmToken = senderData.fcmToken;

        if (!senderFcmToken) {
            return res.status(400).json({ success: false, message: "FCM token not found for the sender." });
        }

        // Retrieve the receiver's FCM token from Firestore using receiver's mobile number
        const receiverRef = db.collection('users').doc(receiverMobile);
        const receiverDoc = await receiverRef.get();

        if (!receiverDoc.exists) {
            return res.status(404).json({ success: false, message: "Receiver not found." });
        }

        const receiverData = receiverDoc.data();
        const receiverFcmToken = receiverData.fcmToken;

        if (!receiverFcmToken) {
            return res.status(400).json({ success: false, message: "FCM token not found for the receiver." });
        }

        // Construct the notification message
        const message = {
            token: receiverFcmToken, // Use the receiver's FCM token
            notification: {
                title: title,
                body: body
            },
            data: { // Optional: Add additional data payload
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                senderMobile: senderMobile, // Send sender's mobile in data payload
                receiverMobile: receiverMobile
            }
        };

        // Send the notification
        const response = await admin.messaging().send(message);
        console.log(`✅ Notification sent successfully from user ${senderMobile} to user ${receiverMobile}`);

        res.status(200).json({ 
            success: true, 
            message: "Notification sent successfully.", 
            response 
        });
    } catch (error) {
        console.error('❌ Error sending notification:', error);
        res.status(500).json({ success: false, message: "Error sending notification.", error: error.message });
    }
});

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log("Decoded Token:", decodedToken); // Debugging
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};

// Signup API
app.post('/signup', async (req, res) => {
    const { name, mobile, password } = req.body;

    if (!name || !mobile || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    try {
        const userRef = db.collection('users').doc(mobile);
        const doc = await userRef.get();

        if (doc.exists) {
            return res.status(400).json({ success: false, message: "User already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userRecord = await admin.auth().createUser({
            uid: mobile,
            phoneNumber: `+91${mobile}`,
            displayName: name
        });

        await userRef.set({
            name,
            mobile,
            password: hashedPassword,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Generate a Firebase authentication token
        const token = await admin.auth().createCustomToken(userRecord.uid);

        res.status(201).json({ 
            success: true, 
            message: "User registered successfully.", 
            token 
        });
    } catch (error) {
        console.error('❌ Error signing up:', error);
        res.status(500).json({ success: false, message: "Error signing up.", error: error.message });
    }
});

// Login API
// Example: Store FCM token in Firestore after login
app.post('/login', async (req, res) => {
    const { mobile, password, fcmToken } = req.body;
    console.log(fcmToken,'fcmToken....')
    console.log(req.body, 'Request Body');

    if (!mobile || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    try {
        const userRef = db.collection('users').doc(mobile);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(400).json({ success: false, message: "User not found." });
        }

        const userData = doc.data();
        const passwordMatch = await bcrypt.compare(password, userData.password);

        if (!passwordMatch) {
            return res.status(400).json({ success: false, message: "Invalid credentials." });
        }

        // Update FCM token in Firestore if it's available
        if (fcmToken) {
            await userRef.update({ fcmToken });
            console.log(`✅ FCM Token updated for user: ${mobile}`);
        }

        // Generate a Firebase authentication token
        const token = await admin.auth().createCustomToken(mobile);

        res.status(200).json({ 
            success: true, 
            message: "Login successful.", 
            user: { name: userData.name, mobile: userData.mobile },
            token
        });
    } catch (error) {
        console.error('❌ Error logging in:', error);
        res.status(500).json({ success: false, message: "Error logging in.", error: error.message });
    }
});

app.get('/get-users', verifyToken, async (req, res) => {
    try {
        const loggedInUserId = req.user ? req.user.uid : null;

        const usersSnapshot = await db.collection('users').orderBy('createdAt', 'desc').get();

        if (usersSnapshot.empty) {
            return res.status(200).json({ success: true, users: [], message: "No users found." });
        }

        let usersList = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Ensure the logged-in user is filtered correctly
        usersList = usersList.filter(user => user.id !== loggedInUserId && user.mobile !== loggedInUserId);

        res.status(200).json({ success: true, users: usersList });
    } catch (error) {
        console.error('❌ Error fetching users:', error);
        res.status(500).json({ success: false, message: "Error fetching users.", error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log('🔥 Firebase Admin initialized');
});
