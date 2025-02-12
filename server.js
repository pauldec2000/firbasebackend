
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
    const { title, userId, channelName, topic } = req.body;
    const topicName = topic || 'all-users';

    try {
        const message = {
            data: {
                title,
                body: `Channel: ${channelName}, UserID: ${userId}`,
                userId,
                channelName
            },
            topic: topicName
        };

        const notificationData = {
            title,
            userId,
            channelName,
            topic: topicName,
            sendAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Notification sent successfully:', response);

        const docRef = await db.collection('notifications').add(notificationData);
        console.log('✅ Notification saved to Firestore with ID:', docRef.id);

        res.status(200).json({ success: true, response, firestoreId: docRef.id });
    } catch (error) {
        console.log('❌ Error sending notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log('🔥 Firebase Admin initialized');
});
