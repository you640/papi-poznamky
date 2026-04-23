import { ChangeDetectionStrategy, Component, inject, signal, ElementRef, viewChildren, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CustomerService } from './customer.service';
import { CustomerDetailComponent } from './customer-detail';
import { CalendarViewComponent } from './calendar-view';
import type { Customer, Visit } from './db';
import { animate, stagger } from 'motion';

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
  datePipe = inject(DatePipe);
  
  currentView = signal<'customers' | 'calendar'>('customers');
  
  selectedCustomer = signal<Customer | null>(null);
  selectedCustomerVisits = signal<Visit[]>([]);
  isAddingCustomer = signal(false);
  bookingCustomer = signal<Customer | null>(null);
  isExportModalOpen = signal(false);

  // Quick Action / Long Press States
  longPressTimer: ReturnType<typeof setTimeout> | null = null;
  isLongPressTriggered = false;
  quickMenuData = signal<Customer | null>(null);
  menuPos = { x: 0, y: 0 };

  // Forms & Modal states
  newCust = { name: '', lastName: '', phone: '', email: '', tags: '' };
  newVisit = { date: new Date().toISOString().split('T')[0], service: '', price: null as number | null, note: '' };
  exportFilters = { dateFrom: '', dateTo: '', tag: '' };

  customerItems = viewChildren<ElementRef>('customerItem');

  // Expose isMobile detector property for templates
  get isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768; // md breakpoint in tailwind
  }

  constructor() {
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

  async selectCustomer(customer: Customer) {
    if (this.isLongPressTriggered || this.quickMenuData()) {
      return; // Ignore regular click if long press context menu was triggered
    }

    this.selectedCustomer.set(customer);
    if (customer.id) {
      const visits = await this.cs.getCustomerVisits(customer.id);
      this.selectedCustomerVisits.set(visits);
    }
  }

  // --- QUICK ACTIONS / LONG PRESS LOGIC ---

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

  async onSaveCustomer(data: { id: number, phone: string, notes: string }) {
    await this.cs.updateCustomer(data.id, { 
      phone: data.phone, 
      notes: data.notes 
    });
    // Refresh selected customer to show changes
    const updated = this.cs.filteredCustomers().find(c => c.id === data.id);
    if (updated) {
      this.selectedCustomer.set(updated);
    }
  }

  async onUpdateVisitNote(data: { id: number, note: string }) {
    await this.cs.updateVisit(data.id, { note: data.note });
    const customer = this.selectedCustomer();
    if (customer?.id) {
      const visits = await this.cs.getCustomerVisits(customer.id);
      this.selectedCustomerVisits.set(visits);
    }
  }

  isFirstOfLetter(customer: Customer, index: number): boolean {
    const list = this.cs.filteredCustomers();
    if (index === 0) return true;
    const prev = list[index - 1];
    
    const currentInitial = customer.lastName?.[0]?.toUpperCase() || '#';
    const prevInitial = prev.lastName?.[0]?.toUpperCase() || '#';
    
    return currentInitial !== prevInitial;
  }

  getInitials(c: Customer) {
    const first = c.name?.[0] || '?';
    const last = c.lastName?.[0] || '?';
    return `${first}${last}`.toUpperCase();
  }

  // --- MODALS ALJA LOGIC ---

  setFilter(tag: string) {
    this.cs.searchQuery.set(tag);
  }

  openNewCustomer() {
    this.newCust = { name: '', lastName: '', phone: '', email: '', tags: '' };
    this.isAddingCustomer.set(true);
  }

  closeNewCustomer() {
    this.isAddingCustomer.set(false);
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
    this.exportFilters = { dateFrom: '', dateTo: '', tag: '' };
    this.isExportModalOpen.set(true);
  }

  closeExportModal() {
    this.isExportModalOpen.set(false);
  }

  async runExport() {
    await this.cs.exportToCSV(this.exportFilters);
    this.closeExportModal();
  }
}
