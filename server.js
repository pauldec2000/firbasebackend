
const express = require('express');
const admin = require('firebase-admin');
const bodyParser=require('body-parser')
const path=require('path')


const serviceAccount = require(path.join(__dirname,'assets','callingnotification-1ec06-firebase-adminsdk-fbsvc-e23231c576.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db=admin.firestore()

const app=express();
const PORT=4000;

app.use(bodyParser.json());

app.post('/send-notification', async (req, res) => {
    const { title, userId, channelName, topic } = req.body;

    const message = {
        data: {  // 🔥 Use "data" instead of "notification"
            title,
            body: `Channel: ${channelName}, UserID: ${userId}`,
            userId,
            channelName
        },
        topic: topic || 'all-users'
    };
    const notificationData={
        title, 
        userId, 
        channelName, 
        topic: topic || 'all-users',
        sendAt:admin.firestore.FieldValue.serverTimestamp()
    }

    try {
        const response = await admin.messaging().send(message);
        console.log('✅ Notification sent successfully:', response);
        const docRef=await db.collection('notifications').add(notificationData);
        console.log('ntoification saved to firebase with Id: ', docRef.id);
        res.status(200).json({ success: true, response ,firestoreId:docRef.id});
    } catch (error) {
        console.log('❌ Error sending notification:', error);
        res.status(500).json({ success: false, error });
    }
});
app.listen(PORT,()=>{
    console.log(`server is running on port ${PORT}`);
    console.log('firebase admin initilized')
} )
