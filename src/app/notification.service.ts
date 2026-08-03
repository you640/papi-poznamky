import { Injectable, signal, inject } from '@angular/core';
import { CustomerService } from './customer.service';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export interface ScheduledReminder {
  visitId: number;
  customerId: number;
  customerName: string;
  service: string;
  visitDate: Date;
  formulaNote?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private cs = inject(CustomerService);

  permissionState = signal<NotificationPermissionState>('default');
  notificationsEnabled = signal<boolean>(false);
  swRegistration = signal<ServiceWorkerRegistration | null>(null);
  scheduledRemindersCount = signal<number>(0);

  // Modal / Help guidance states
  showPermissionGuideModal = signal<boolean>(false);
  lastNotificationStatusMsg = signal<string | null>(null);

  constructor() {
    this.initNotificationState();
  }

  private initNotificationState() {
    if (typeof window === 'undefined') {
      this.permissionState.set('unsupported');
      return;
    }

    if (!('Notification' in window)) {
      this.permissionState.set('unsupported');
      return;
    }

    const currentPermission = Notification.permission as NotificationPermissionState;
    this.permissionState.set(currentPermission);

    const storedEnabled = localStorage.getItem('papi_notifications_enabled');
    if (storedEnabled !== null) {
      this.notificationsEnabled.set(storedEnabled === 'true' && currentPermission === 'granted');
    } else if (currentPermission === 'granted') {
      this.notificationsEnabled.set(true);
    }

    // Connect with Service Worker registration if active
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        this.swRegistration.set(reg);
      }).catch(() => {
        // SW not ready yet
      });
    }

    // Schedule background checks for upcoming appointments if enabled
    if (this.notificationsEnabled()) {
      this.checkAndScheduleReminders();
    }
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.permissionState.set('unsupported');
      this.lastNotificationStatusMsg.set('Váš prehliadač nepodporuje Notification API.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionState.set(permission as NotificationPermissionState);

      if (permission === 'granted') {
        this.notificationsEnabled.set(true);
        localStorage.setItem('papi_notifications_enabled', 'true');
        this.lastNotificationStatusMsg.set('Notifikácie salónu boli úspešne aktivované! ✨');
        this.sendTestNotification();
        this.checkAndScheduleReminders();
        return true;
      } else if (permission === 'denied') {
        this.notificationsEnabled.set(false);
        localStorage.setItem('papi_notifications_enabled', 'false');
        this.showPermissionGuideModal.set(true);
        this.lastNotificationStatusMsg.set('Notifikácie sú blokované v nastaveniach prehliadača.');
        return false;
      }
    } catch (e) {
      console.error('Error requesting notification permission:', e);
      this.lastNotificationStatusMsg.set('Nastala chyba pri žiadaní o povolenie.');
    }

    return false;
  }

  toggleNotifications(enable: boolean) {
    if (enable) {
      if (this.permissionState() === 'granted') {
        this.notificationsEnabled.set(true);
        localStorage.setItem('papi_notifications_enabled', 'true');
        this.lastNotificationStatusMsg.set('Notifikácie sú zapnuté.');
        this.checkAndScheduleReminders();
      } else {
        this.requestPermission();
      }
    } else {
      this.notificationsEnabled.set(false);
      localStorage.setItem('papi_notifications_enabled', 'false');
      this.lastNotificationStatusMsg.set('Notifikácie boli vypnuté.');
    }
  }

  async sendTestNotification() {
    const title = 'Papi Hair Design CRM';
    const options: NotificationOptions = {
      body: 'Skúšobná notifikácia salónu funguje bleskovo! ✂️✨ Pripomienky termínov sú aktívne.',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: 'papi-test-notification',
      data: { url: '/', test: true }
    };

    await this.dispatchNotification(title, options);
  }

  async sendAppointmentReminder(customerName: string, service: string, timeStr: string, formulaNote?: string, customerId?: number, visitId?: number) {
    const title = `Nadchádzajúci termín: ${customerName}`;
    let bodyText = `${service || 'Úprava vlasov'} o ${timeStr}.`;
    if (formulaNote && formulaNote.trim()) {
      bodyText += ` Skontrolujte namiešanú receptúru (${formulaNote.trim()}).`;
    }

    const options: NotificationOptions = {
      body: bodyText,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      tag: `papi-visit-${visitId || Date.now()}`,
      data: {
        customerId,
        visitId,
        url: `/?customer=${customerId || ''}`,
        tab: 'calendar'
      }
    };

    await this.dispatchNotification(title, options);
  }

  private async dispatchNotification(title: string, options: NotificationOptions) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission !== 'granted') {
      console.warn('Notifications permission not granted.');
      return;
    }

    try {
      // 1. Prefer Service Worker Registration if available (works on background / PWA standalone iOS)
      const reg = this.swRegistration() || (await navigator.serviceWorker?.getRegistration());
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return;
      }
    } catch (e) {
      console.warn('Service worker notification failed, using direct Notification fallback:', e);
    }

    // 2. Fallback to direct Notification constructor
    try {
      new Notification(title, options);
    } catch (err) {
      console.error('Failed to trigger Notification:', err);
    }
  }

  async checkAndScheduleReminders() {
    if (!this.notificationsEnabled() || this.permissionState() !== 'granted') return;

    try {
      const allVisitsWithCustomers = await this.cs.getAllVisitsWithCustomers();
      const now = new Date();
      const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Filter upcoming visits within next 24 hours
      const upcoming = allVisitsWithCustomers.filter(v => {
        if (!v.date) return false;
        const vDate = new Date(v.date);
        return vDate >= now && vDate <= next24h;
      });

      this.scheduledRemindersCount.set(upcoming.length);

      // Check which visits haven't been notified yet
      const notifiedVisitIdsStr = localStorage.getItem('papi_notified_visit_ids') || '[]';
      const notifiedSet = new Set<number>(JSON.parse(notifiedVisitIdsStr));

      for (const visit of upcoming) {
        if (visit.id && !notifiedSet.has(visit.id)) {
          const cust = visit.customer;
          const fullName = cust ? `${cust.name} ${cust.lastName}`.trim() : 'Zákazník';
          const timeStr = new Date(visit.date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
          
          // Get formula notes if present
          const formulaNote = cust?.formulas?.[0]?.formula || cust?.notes || '';

          await this.sendAppointmentReminder(fullName, visit.service, timeStr, formulaNote, cust?.id, visit.id);
          notifiedSet.add(visit.id);
        }
      }

      localStorage.setItem('papi_notified_visit_ids', JSON.stringify(Array.from(notifiedSet)));
    } catch (e) {
      console.error('Error checking upcoming reminders:', e);
    }
  }

  closePermissionGuide() {
    this.showPermissionGuideModal.set(false);
  }
}
