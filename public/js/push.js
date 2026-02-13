// Push notification subscription logic for Familia Bendecida

async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return;
  }

  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered');

    // Check if already subscribed
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      console.log('Already subscribed to push');
      await sendSubscriptionToServer(existing);
      return;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return;
    }

    // Get VAPID public key from server
    const token = localStorage.getItem('token');
    const res = await fetch('/api/push/vapid-key', {
      headers: { 'x-access-token': token }
    });
    const { publicKey } = await res.json();

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await sendSubscriptionToServer(subscription);
    console.log('Push subscription successful');
  } catch (err) {
    console.error('Push subscription error:', err);
  }
}

async function sendSubscriptionToServer(subscription) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));
  if (!token || !user) return;

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      userId: user.id
    })
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
