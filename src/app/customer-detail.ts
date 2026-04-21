import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import type { Customer, Visit } from './db';

@Component({
  standalone: true,
  selector: 'app-customer-detail',
  imports: [CommonModule, MatIconModule],
  providers: [DatePipe],
  templateUrl: './customer-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailComponent {
  customer = input.required<Customer>();
  visits = input<Visit[]>([]);
  
  closed = output<void>();
  edit = output<Customer>();
  book = output<Customer>();

  getInitials(c: Customer) {
    return `${c.name[0]}${c.lastName[0]}`.toUpperCase();
  }
}
