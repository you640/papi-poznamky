import { ChangeDetectionStrategy, Component, inject, signal, ElementRef, viewChildren, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CustomerService } from './customer.service';
import { NotificationService } from './notification.service';
import { CustomerDetailComponent } from './customer-detail';
import { CalendarViewComponent } from './calendar-view';
import { db, type Customer, type Visit } from './db';
import { animate, stagger } from 'motion';
import { compressImage } from './image-utils';

export interface PwaInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, FormsModule, MatIconModule, CustomerDetailComponent, CalendarViewComponent],
  providers: [DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  cs = inject(CustomerService);
  ns = inject(NotificationService);
  datePipe = inject(DatePipe);
  
  currentView = signal<'customers' | 'calendar'>('customers');
  
  selectedCustomer = signal<Customer | null>(null);
  selectedCustomerVisits = signal<Visit[]>([]);
  isAddingCustomer = signal(false);
  bookingCustomer = signal<Customer | null>(null);
  isExportModalOpen = signal(false);
  isWipeModalOpen = signal(false);
  isCleanupModalOpen = signal(false);
  isNotificationModalOpen = signal(false);
  cleanupReport = signal<{ mergedGroupsCount: number; removedDuplicatesCount: number; reassignedVisitsCount: number } | null>(null);
  isCleaningDuplicates = signal(false);

  // Quick Action / Long Press States
  longPressTimer: ReturnType<typeof setTimeout> | null = null;
  isLongPressTriggered = false;
  quickMenuData = signal<Customer | null>(null);
  menuPos = { x: 0, y: 0 };

  // Forms & Modal states
  newCust = { name: '', lastName: '', phone: '', email: '', tags: '', photo: '' };
  newVisit = { date: new Date().toISOString().split('T')[0], service: '', price: null as number | null, note: '' };
  exportFilters = { tag: '' };

  customerItems = viewChildren<ElementRef>('customerItem');

  showPersistencePrompt = signal(false);
  isPersistenceLoading = signal(false);
  persistenceRequestFailed = signal(false);

  // PWA & Network signals
  deferredInstallPrompt = signal<PwaInstallPromptEvent | null>(null);
  isStandalone = signal<boolean>(false);
  isOffline = signal<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  installBannerDismissed = signal<boolean>(typeof localStorage !== 'undefined' && localStorage.getItem('papi_install_dismissed') === 'true');
  isIos = signal<boolean>(false);
  showIosInstallModal = signal<boolean>(false);

  // Swipe Gestures & Delete Confirmation Signals
  activeSwipedCustomerId = signal<number | null>(null);
  swipeOffset = signal<number>(0);
  isSwiping = signal<boolean>(false);
  customerToDelete = signal<Customer | null>(null);

  private swipeStartX = 0;
  private swipeStartY = 0;
  private isHorizontalSwipe: boolean | null = null;
  private thresholdVibrated = false;

  // Expose isMobile detector property for templates
  get isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768; // md breakpoint in tailwind
  }

  constructor() {
    this.checkPersistence();
    this.setupPwaAndNetworkListeners();

    // Initial and subsequent animations
    effect(() => {
      const items = this.customerItems();
      this.cs.filteredCustomers(); // Dependency to trigger on filter
      
      if (items.length > 0) {
        animate(
          items.map(i => i.nativeElement),
          { opacity: [0, 1], y: [10, 0] },
          { delay: stagger(0.03), duration: 0.4, ease: 'easeOut' }
        );
      }
    });
  }

  private setupPwaAndNetworkListeners() {
    if (typeof window === 'undefined') return;

    // Detect standalone mode
    const navWithStandalone = navigator as unknown as { standalone?: boolean };
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || Boolean(navWithStandalone.standalone);
    this.isStandalone.set(isStandaloneMode);

    // Detect iOS device
    const ua = navigator.userAgent;
    const isIosDevice = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.isIos.set(isIosDevice);

    // Intercept beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt.set(e as PwaInstallPromptEvent);
    });

    // Online / Offline status
    window.addEventListener('online', () => this.isOffline.set(false));
    window.addEventListener('offline', () => this.isOffline.set(true));

    // Listen for Service Worker Notification Click Deep Links
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'OPEN_CUSTOMER') {
          const custId = Number(event.data.customerId);
          const cust = this.cs.customersList().find(c => c.id === custId);
          if (cust) {
            this.selectCustomer(cust);
          }
        } else if (event.data && event.data.type === 'SWITCH_TAB') {
          this.currentView.set(event.data.tab || 'calendar');
        }
      });
    }
  }

  openNotificationModal() {
    this.isNotificationModalOpen.set(true);
  }

  closeNotificationModal() {
    this.isNotificationModalOpen.set(false);
  }

  async installPwaApp() {
    const promptEvent = this.deferredInstallPrompt();
    if (promptEvent) {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        this.deferredInstallPrompt.set(null);
      }
    } else {
      // Show iOS / Firefox / Safari manual install instruction modal
      this.showIosInstallModal.set(true);
    }
  }

  closeIosInstallModal() {
    this.showIosInstallModal.set(false);
  }

  dismissInstallBanner() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('papi_install_dismissed', 'true');
    }
    this.installBannerDismissed.set(true);
  }

  async checkPersistence() {
    if (typeof window === 'undefined' || !navigator.storage || !navigator.storage.persist) {
      return;
    }
    try {
      const alreadyPersisted = await navigator.storage.persisted();
      const dismissed = localStorage.getItem('papi_persistence_prompt_dismissed_v2') === 'true';
      if (!alreadyPersisted && !dismissed) {
        setTimeout(() => {
          this.showPersistencePrompt.set(true);
        }, 1200);
      }
    } catch (e) {
      console.warn('Persistence check error:', e);
    }
  }

  async requestPersistence() {
    this.isPersistenceLoading.set(true);
    this.persistenceRequestFailed.set(false);
    if (typeof window !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const persisted = await navigator.storage.persist();
        if (persisted) {
          localStorage.setItem('papi_persistence_prompt_dismissed_v2', 'true');
          this.showPersistencePrompt.set(false);
        } else {
          this.persistenceRequestFailed.set(true);
        }
      } catch (e) {
        console.error('Persistence request failed:', e);
        this.persistenceRequestFailed.set(true);
      } finally {
        this.isPersistenceLoading.set(false);
      }
    } else {
      this.isPersistenceLoading.set(false);
      this.showPersistencePrompt.set(false);
    }
  }

  dismissPersistence() {
    localStorage.setItem('papi_persistence_prompt_dismissed_v2', 'true');
    this.showPersistencePrompt.set(false);
  }

  async selectCustomer(customer: Customer) {
    if (this.isLongPressTriggered || this.quickMenuData() || Math.abs(this.swipeOffset()) > 15) {
      return; // Ignore regular click if long press or swipe gesture was triggered
    }

    this.selectedCustomer.set(customer);
    if (customer.id) {
      const visits = await this.cs.getCustomerVisits(customer.id);
      this.selectedCustomerVisits.set(visits);
    }
  }

  // --- SWIPE GESTURES LOGIC ---

  getSwipeOffsetFor(customerId?: number): number {
    if (!customerId || this.activeSwipedCustomerId() !== customerId) return 0;
    return this.swipeOffset();
  }

  isCustomerSwiping(customerId?: number): boolean {
    return Boolean(customerId && this.activeSwipedCustomerId() === customerId && this.isSwiping());
  }

  onSwipeTouchStart(event: TouchEvent, customer: Customer) {
    if (!customer.id || event.touches.length !== 1) return;
    const touch = event.touches[0];
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
    this.isHorizontalSwipe = null;
    this.thresholdVibrated = false;
    this.activeSwipedCustomerId.set(customer.id);
    this.isSwiping.set(true);
  }

  onSwipeTouchMove(event: TouchEvent, customer: Customer) {
    if (!customer.id || !this.isSwiping() || this.activeSwipedCustomerId() !== customer.id) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.swipeStartX;
    const deltaY = touch.clientY - this.swipeStartY;

    if (this.isHorizontalSwipe === null) {
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        this.isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
        if (this.isHorizontalSwipe && this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }
    }

    if (this.isHorizontalSwipe === true) {
      if (event.cancelable) {
        event.preventDefault();
      }
      let offset = deltaX;
      if (offset < -120) offset = -120 + (offset + 120) * 0.2;
      if (offset > 120) offset = 120 + (offset - 120) * 0.2;

      this.swipeOffset.set(offset);

      if (!this.thresholdVibrated && Math.abs(offset) >= 75) {
        this.triggerHapticFeedback();
        this.thresholdVibrated = true;
      } else if (this.thresholdVibrated && Math.abs(offset) < 60) {
        this.thresholdVibrated = false;
      }
    }
  }

  onSwipeTouchEnd(customer: Customer) {
    if (!customer.id || !this.isSwiping() || this.activeSwipedCustomerId() !== customer.id) return;

    const finalOffset = this.swipeOffset();
    this.isSwiping.set(false);

    if (finalOffset <= -75) {
      // Swipe Left -> Delete Action
      this.triggerHapticFeedback();
      this.confirmDeleteCustomer(customer);
    } else if (finalOffset >= 75) {
      // Swipe Right -> Edit Action
      this.triggerHapticFeedback();
      this.selectCustomer(customer);
    }

    this.swipeOffset.set(0);
    setTimeout(() => {
      if (this.activeSwipedCustomerId() === customer.id) {
        this.activeSwipedCustomerId.set(null);
      }
    }, 200);
  }

  confirmDeleteCustomer(customer: Customer) {
    this.customerToDelete.set(customer);
  }

  cancelDeleteCustomer() {
    this.customerToDelete.set(null);
  }

  async proceedDeleteCustomer() {
    const cust = this.customerToDelete();
    if (cust && cust.id) {
      await this.cs.deleteCustomer(cust.id);
      if (this.selectedCustomer()?.id === cust.id) {
        this.closeDetail();
      }
    }
    this.customerToDelete.set(null);
  }

  // --- QUICK ACTIONS / LONG PRESS LOGIC ---

  triggerHapticFeedback() {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(20); // Subtle 20ms vibration for beautiful tactile touch response
      } catch (e) {
        console.warn('Haptic feedback is not supported or was blocked:', e);
      }
    }
  }

  onPointerDown(event: PointerEvent, customer: Customer) {
    if (event.pointerType === 'mouse' && event.button !== 0) return; // Only left click or touch
    
    this.isLongPressTriggered = false;
    this.longPressTimer = setTimeout(() => {
      this.isLongPressTriggered = true;
      this.quickMenuData.set(customer);
      this.menuPos = {
        x: Math.min(event.clientX, window.innerWidth - 260),
        y: Math.min(event.clientY, window.innerHeight - 250)
      };
      this.triggerHapticFeedback();
    }, 500); // Trigger after 500ms
  }

  onPointerUp() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  onContextMenu(event: Event) {
    event.preventDefault(); // Zamedzi defaultnemu popup-u
  }

  async qmBook(customer: Customer) {
    this.quickMenuData.set(null);
    this.isLongPressTriggered = false;
    const visits = await this.cs.getCustomerVisits(customer.id!);
    const lastVisit = visits[0]; // Visits are sorted descending
    
    this.openBookVisit(customer);
    if (lastVisit) {
      this.newVisit.service = lastVisit.service;
      this.newVisit.price = lastVisit.price;
    }
  }

  qmCall(customer: Customer) {
    this.quickMenuData.set(null);
    this.isLongPressTriggered = false;
    if (customer.phone) {
      window.location.href = `tel:${customer.phone}`;
    }
  }

  qmMessage(customer: Customer) {
    this.quickMenuData.set(null);
    this.isLongPressTriggered = false;
    if (customer.phone) {
      const msg = encodeURIComponent(`Dobrý deň ${customer.name}, pripomíname Vám rezervovaný termín v Papi CRM.`);
      window.location.href = `sms:${customer.phone}?body=${msg}`;
    }
  }

  async qmToggleVip(customer: Customer) {
    this.quickMenuData.set(null);
    this.isLongPressTriggered = false;
    const isVip = customer.tags.includes('VIP');
    const newTags = isVip 
        ? customer.tags.filter(t => t !== 'VIP')
        : [...customer.tags, 'VIP'];
    
    await this.cs.updateCustomer(customer.id!, { tags: newTags });
    
    if (this.selectedCustomer()?.id === customer.id) {
        const updated = this.cs.filteredCustomers().find(c => c.id === customer.id);
        if (updated) this.selectedCustomer.set(updated);
    }
  }

  // --- MODALS NORMAL LOGIC ---

  closeDetail() {
    this.selectedCustomer.set(null);
    this.selectedCustomerVisits.set([]);
  }

  async onSaveCustomer(data: { id: number, name: string, lastName: string, phone: string, email: string, tags: string[], notes: string, photo?: string }) {
    await this.cs.updateCustomer(data.id, { 
      name: data.name,
      lastName: data.lastName,
      phone: data.phone, 
      email: data.email,
      tags: data.tags,
      notes: data.notes,
      ...(data.photo !== undefined ? { photo: data.photo } : {})
    });
    // Refresh selected customer to show changes
    const updated = await db.customers.get(data.id);
    if (updated) {
      this.selectedCustomer.set(updated);
    }
  }

  async onDeleteCustomer(customerId: number) {
    await this.cs.deleteCustomer(customerId);
    this.closeDetail();
  }

  async onUpdateVisitNote(data: { id: number, note: string }) {
    await this.cs.updateVisit(data.id, { note: data.note });
    const customer = this.selectedCustomer();
    if (customer?.id) {
      const visits = await this.cs.getCustomerVisits(customer.id);
      this.selectedCustomerVisits.set(visits);
    }
  }

  getLetterInitial(customer: Customer): string {
    if (customer.lastName && customer.lastName.trim()) {
      return customer.lastName.trim()[0].toUpperCase();
    }
    if (customer.name && customer.name.trim()) {
      return customer.name.trim()[0].toUpperCase();
    }
    return '#';
  }

  isFirstOfLetter(customer: Customer, index: number): boolean {
    if (this.cs.sortBy() !== 'alphabetical') {
      return false;
    }
    const list = this.cs.filteredCustomers();
    if (index === 0) return true;
    const prev = list[index - 1];
    
    const currentInitial = this.getLetterInitial(customer);
    const prevInitial = this.getLetterInitial(prev);
    
    return currentInitial !== prevInitial;
  }

  getInitials(c: Customer) {
    if (!c) return '??';
    const first = c.name?.trim()?.[0] || '';
    const last = c.lastName?.trim()?.[0] || '';
    if (first && last) {
      return `${first}${last}`.toUpperCase();
    }
    if (first) {
      return c.name.trim().slice(0, 2).toUpperCase();
    }
    return '??';
  }

  // --- MODALS ALJA LOGIC ---

  setFilter(tag: string) {
    this.cs.searchQuery.set(tag);
  }

  openNewCustomer() {
    this.newCust = { name: '', lastName: '', phone: '', email: '', tags: '', photo: '' };
    this.isAddingCustomer.set(true);
  }

  closeNewCustomer() {
    this.isAddingCustomer.set(false);
  }

  async onNewCustPhotoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      try {
        const compressed = await compressImage(file, 800, 800, 0.82);
        this.newCust.photo = compressed;
      } catch (e) {
        console.warn('Compress photo error:', e);
      }
    }
  }

  async saveNewCustomer() {
    if (this.newCust.name && this.newCust.lastName) {
      const tagsArray = this.newCust.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
        
      const newCustomerData: Omit<Customer, 'id'> = {
        name: this.newCust.name.trim(),
        lastName: this.newCust.lastName.trim(),
        phone: this.newCust.phone.trim(),
        email: this.newCust.email.trim(),
        tags: tagsArray,
        photo: this.newCust.photo || undefined,
        lastVisit: undefined
      };

      await this.cs.addCustomer(newCustomerData);
      this.closeNewCustomer();
      this.cs.searchQuery.set('');
    }
  }

  openBookVisit(customer: Customer) {
    this.newVisit = { date: new Date().toISOString().split('T')[0], service: '', price: null, note: '' };
    this.bookingCustomer.set(customer);
  }

  closeBookVisit() {
    this.bookingCustomer.set(null);
  }

  async saveNewVisit() {
    const c = this.bookingCustomer();
    if (c && c.id && this.newVisit.service && this.newVisit.date) {
      const dateObj = new Date(this.newVisit.date);
      await this.cs.addVisit({
        customerId: c.id,
        date: dateObj,
        service: this.newVisit.service.trim(),
        price: this.newVisit.price || 0,
        note: this.newVisit.note.trim()
      });

      if (this.selectedCustomer()?.id === c.id) {
        const visits = await this.cs.getCustomerVisits(c.id);
        this.selectedCustomerVisits.set(visits);
      }
      
      this.closeBookVisit();
    }
  }

  // --- EXPORT LOGIC ---
  openExportModal() {
    this.exportFilters = { tag: '' };
    this.isExportModalOpen.set(true);
  }

  closeExportModal() {
    this.isExportModalOpen.set(false);
  }

  async runExport() {
    await this.cs.exportToCSV(this.exportFilters);
    this.closeExportModal();
  }

  // --- WIPE ALL LOGIC ---
  openWipeModal() {
    this.isWipeModalOpen.set(true);
  }

  closeWipeModal() {
    this.isWipeModalOpen.set(false);
  }

  async wipeEntireApplication() {
    await this.cs.wipeAllData();
    this.closeDetail();
    this.closeWipeModal();
  }

  // --- DUP CLEANUP LOGIC ---
  openCleanupModal() {
    this.cleanupReport.set(null);
    this.isCleanupModalOpen.set(true);
  }

  closeCleanupModal() {
    this.isCleanupModalOpen.set(false);
  }

  async runCleanupDuplicates() {
    this.isCleaningDuplicates.set(true);
    try {
      const res = await this.cs.cleanupDuplicates();
      this.cleanupReport.set(res);
    } finally {
      this.isCleaningDuplicates.set(false);
    }
  }
}
