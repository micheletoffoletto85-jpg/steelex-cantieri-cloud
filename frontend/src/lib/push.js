/**
 * Gestione Web Push Notifications
 */
import api from './api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function registraPushNotifications() {
  // Controlla supporto browser
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications non supportate da questo browser')
    return false
  }

  try {
    // Recupera chiave pubblica VAPID dal backend
    const { data } = await api.get('/notifiche/vapid-public-key').catch(() => ({ data: null }))
    if (!data?.public_key) {
      console.log('VAPID non configurato sul backend')
      return false
    }

    // Registra service worker
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    // Controlla se già iscritto
    const existingSub = await registration.pushManager.getSubscription()
    if (existingSub) {
      await inviaSubscription(existingSub)
      return true
    }

    // Chiedi permesso
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('Permesso notifiche negato')
      return false
    }

    // Crea nuova subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.public_key),
    })

    await inviaSubscription(subscription)
    return true
  } catch (err) {
    console.error('Errore registrazione push:', err)
    return false
  }
}

async function inviaSubscription(subscription) {
  const sub = subscription.toJSON()
  await api.post('/notifiche/subscribe', {
    endpoint: sub.endpoint,
    p256dh: sub.keys?.p256dh || '',
    auth: sub.keys?.auth || '',
  })
}

export async function disattivaPushNotifications() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    await api.delete(`/notifiche/unsubscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`)
    await subscription.unsubscribe()
  }
}

export function supportaNotifiche() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}
