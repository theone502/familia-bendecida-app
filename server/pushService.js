const webpush = require('web-push');
const db = require('./database');

// Configure VAPID
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:andres@familia.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Send push notification to all subscriptions (optionally exclude a user)
async function sendPushToAll(payload, excludeUserId = null) {
  try {
    let query = 'SELECT * FROM push_subscriptions';
    const params = [];
    if (excludeUserId) {
      query += ' WHERE user_id != ?';
      params.push(excludeUserId);
    }

    const subscriptions = await db.all(query, params);

    const results = await Promise.allSettled(
      subscriptions.map(async (row) => {
        const subscription = {
          endpoint: row.endpoint,
          keys: {
            p256dh: row.p256dh,
            auth: row.auth
          }
        };

        try {
          await webpush.sendNotification(subscription, JSON.stringify(payload));
        } catch (err) {
          // Remove invalid/expired subscriptions
          if (err.statusCode === 404 || err.statusCode === 410) {
            await db.run('DELETE FROM push_subscriptions WHERE id = ?', [row.id]);
          }
          throw err;
        }
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`Push sent: ${sent} success, ${failed} failed`);
  } catch (err) {
    console.error('Push broadcast error:', err);
  }
}

module.exports = { sendPushToAll };
