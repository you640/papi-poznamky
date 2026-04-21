import { ChangeDetectionStrategy, Component, inject, signal, ElementRef, viewChildren, afterNextRender } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CustomerService } from './customer.service';
import { CustomerDetailComponent } from './customer-detail';
import type { Customer, Visit } from './db';
import { animate, stagger } from 'motion';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, FormsModule, MatIconModule, CustomerDetailComponent],
  providers: [DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  cs = inject(CustomerService);
  datePipe = inject(DatePipe);
  
  selectedCustomer = signal<Customer | null>(null);
  selectedCustomerVisits = signal<Visit[]>([]);
  isAddingCustomer = signal(false);

  customerItems = viewChildren<ElementRef>('customerItem');

  constructor() {
    afterNextRender(() => {
      const items = this.customerItems();
      if (items.length > 0) {
        animate(
          items.map(i => i.nativeElement),
          { opacity: [0, 1], y: [20, 0] },
          { delay: stagger(0.05), duration: 0.5, ease: 'easeOut' }
        );
      }
    });

    // Re-animate list when filtered results change
    // Note: in a real app we might want to be more surgical, but for demo this works
  }

  async selectCustomer(customer: Customer) {
    this.selectedCustomer.set(customer);
    if (customer.id) {
      const visits = await this.cs.getCustomerVisits(customer.id);
      this.selectedCustomerVisits.set(visits);
    }
  }

  closeDetail() {
    this.selectedCustomer.set(null);
    this.selectedCustomerVisits.set([]);
  }

  isFirstOfLetter(customer: Customer, index: number): boolean {
    const list = this.cs.filteredCustomers();
    if (index === 0) return true;
    return customer.lastName[0].toUpperCase() !== list[index - 1].lastName[0].toUpperCase();
  }

  getInitials(c: Customer) {
    return `${c.name[0]}${c.lastName[0]}`.toUpperCase();
  }
}
