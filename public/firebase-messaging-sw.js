/* eslint-disable no-undef */
importScripts('/firebase-sw-config.js')
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js')

if (self.FIREBASE_SW_CONFIG && self.FIREBASE_SW_CONFIG.apiKey && self.FIREBASE_SW_CONFIG.projectId) {
  firebase.initializeApp(self.FIREBASE_SW_CONFIG)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Moodle Tasks'
    const body = payload.notification?.body || payload.data?.body || ''
    const icon = payload.data?.icon || '/icon-192.png'
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icon-192.png',
      data: payload.data || {},
    })
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'))
})
