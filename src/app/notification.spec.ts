import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';
import { CustomerService } from './customer.service';

describe('NotificationService Tests', () => {
  let ns: NotificationService;

  beforeEach(() => {
    localStorage.clear();
    // Mock Notification API in vitest window context
    const mockNotification = vi.fn();
    (mockNotification as unknown as Record<string, unknown>)['permission'] = 'default';
    (mockNotification as unknown as Record<string, unknown>)['requestPermission'] = vi.fn().mockResolvedValue('granted');
    
    (globalThis as unknown as Record<string, unknown>)['Notification'] = mockNotification;
    (globalThis as unknown as Record<string, unknown>)['window'] = globalThis;

    TestBed.configureTestingModule({
      providers: [NotificationService, CustomerService]
    });

    ns = TestBed.inject(NotificationService);
  });

  it('should initialize with default permission state', () => {
    expect(ns.permissionState()).toBe('default');
    expect(ns.notificationsEnabled()).toBe(false);
  });

  it('should request permission and activate notifications when granted', async () => {
    const granted = await ns.requestPermission();
    expect(granted).toBe(true);
    expect(ns.permissionState()).toBe('granted');
    expect(ns.notificationsEnabled()).toBe(true);
    expect(localStorage.getItem('papi_notifications_enabled')).toBe('true');
  });

  it('should handle denied permission gracefully', async () => {
    const mockNotif = (globalThis as unknown as Record<string, Record<string, unknown>>)['Notification'];
    mockNotif['requestPermission'] = vi.fn().mockResolvedValue('denied');

    const granted = await ns.requestPermission();
    expect(granted).toBe(false);
    expect(ns.permissionState()).toBe('denied');
    expect(ns.notificationsEnabled()).toBe(false);
    expect(ns.showPermissionGuideModal()).toBe(true);
  });

  it('should trigger test notification when permission is granted', async () => {
    const notificationConstructor = vi.fn();
    (globalThis as unknown as Record<string, unknown>)['Notification'] = Object.assign(notificationConstructor, {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted')
    });

    ns.permissionState.set('granted');
    ns.notificationsEnabled.set(true);

    await ns.sendTestNotification();
    expect(notificationConstructor).toHaveBeenCalledWith(
      'Papi Hair Design CRM',
      expect.objectContaining({
        icon: '/icon-192.svg',
        badge: '/icon-192.svg'
      })
    );
  });

  it('should structure appointment reminder with customer formula notes', async () => {
    const notificationConstructor = vi.fn();
    (globalThis as unknown as Record<string, unknown>)['Notification'] = Object.assign(notificationConstructor, {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted')
    });

    ns.permissionState.set('granted');
    ns.notificationsEnabled.set(true);

    await ns.sendAppointmentReminder(
      'Anička Nováková',
      'Farbenie K: 8,13 + 8',
      '15:00',
      'Olaplex + Toner 9,1',
      12,
      99
    );

    expect(notificationConstructor).toHaveBeenCalledWith(
      'Nadchádzajúci termín: Anička Nováková',
      expect.objectContaining({
        body: expect.stringContaining('Olaplex + Toner 9,1'),
        icon: '/icon-192.svg',
        badge: '/icon-192.svg'
      })
    );
  });
});
