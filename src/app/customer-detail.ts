import { ChangeDetectionStrategy, Component, input, output, signal, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import type { Customer, Visit } from './db';

@Component({
  standalone: true,
  selector: 'app-customer-detail',
  imports: [CommonModule, MatIconModule, FormsModule],
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
  save = output<{ id: number, name: string, lastName: string, phone: string, email: string, tags: string[], notes: string, photo?: string }>();
  deleteCustomer = output<number>();
  updateVisitNote = output<{ id: number, note: string }>();

  isEditing = signal(false);
  editName = signal('');
  editLastName = signal('');
  editPhone = signal('');
  editEmail = signal('');
  editTags = signal('');
  editNotes = signal('');
  editPhoto = signal('');

  // Camera API modal states
  isCameraOpen = signal(false);
  isCameraActive = signal(false);
  cameraError = signal<string | null>(null);
  capturedPhoto = signal<string | null>(null);
  facingMode = signal<'user' | 'environment'>('environment');
  mediaStream: MediaStream | null = null;

  editingVisitId = signal<number | null>(null);
  currentEditVisitNote = signal('');

  isDeleteConfirmOpen = signal(false);

  constructor() {
    effect(() => {
      const c = this.customer();
      this.editName.set(c.name || '');
      this.editLastName.set(c.lastName || '');
      this.editPhone.set(c.phone || '');
      this.editEmail.set(c.email || '');
      this.editTags.set((c.tags || []).join(', '));
      this.editNotes.set(c.notes || '');
      this.editPhoto.set(c.photo || '');
      this.isEditing.set(false);
      this.isDeleteConfirmOpen.set(false);
    });
  }

  toggleEdit() {
    this.isEditing.update(v => !v);
  }

  cancelEdit() {
    const c = this.customer();
    this.editName.set(c.name || '');
    this.editLastName.set(c.lastName || '');
    this.editPhone.set(c.phone || '');
    this.editEmail.set(c.email || '');
    this.editTags.set((c.tags || []).join(', '));
    this.editNotes.set(c.notes || '');
    this.editPhoto.set(c.photo || '');
    this.isEditing.set(false);
  }

  saveChanges() {
    const c = this.customer();
    if (c.id) {
      const tagsArray = this.editTags()
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      this.save.emit({
        id: c.id,
        name: this.editName().trim(),
        lastName: this.editLastName().trim(),
        phone: this.editPhone().trim(),
        email: this.editEmail().trim(),
        tags: tagsArray,
        notes: this.editNotes(),
        photo: this.editPhoto()
      });
      this.isEditing.set(false);
    }
  }

  // --- CAMERA API METHODS ---
  openCameraModal() {
    this.capturedPhoto.set(null);
    this.cameraError.set(null);
    this.isCameraOpen.set(true);
    this.startCameraStream();
  }

  closeCameraModal() {
    this.stopCameraStream();
    this.isCameraOpen.set(false);
    this.capturedPhoto.set(null);
    this.cameraError.set(null);
  }

  async startCameraStream() {
    this.stopCameraStream();
    this.cameraError.set(null);
    this.isCameraActive.set(false);

    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Fotoaparát nie je v tomto prehliadači podporovaný.');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: this.facingMode(),
          width: { ideal: 1024 },
          height: { ideal: 1024 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.mediaStream = stream;
      this.isCameraActive.set(true);

      setTimeout(() => {
        const videoEl = document.getElementById('cameraFeedVideo') as HTMLVideoElement;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(err => console.warn('Video stream error:', err));
        }
      }, 100);
    } catch (err) {
      console.warn('Camera error:', err);
      const errMsg = err instanceof Error ? err.message : 'Nepodarilo sa spustiť kamera stream. Použite nahratie súboru.';
      this.cameraError.set(errMsg);
      this.isCameraActive.set(false);
    }
  }

  toggleFacingMode() {
    this.facingMode.update(m => m === 'user' ? 'environment' : 'user');
    this.startCameraStream();
  }

  takePhoto() {
    const videoEl = document.getElementById('cameraFeedVideo') as HTMLVideoElement;
    if (!videoEl) return;

    const canvas = document.createElement('canvas');
    const width = videoEl.videoWidth || 640;
    const height = videoEl.videoHeight || 640;

    const size = Math.min(width, height);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const startX = (width - size) / 2;
      const startY = (height - size) / 2;
      ctx.drawImage(videoEl, startX, startY, size, size, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      this.capturedPhoto.set(dataUrl);
      this.stopCameraStream();
    }
  }

  retakePhoto() {
    this.capturedPhoto.set(null);
    this.startCameraStream();
  }

  confirmPhoto() {
    const photo = this.capturedPhoto();
    const c = this.customer();
    if (c && c.id && photo !== null) {
      this.editPhoto.set(photo);
      this.save.emit({
        id: c.id,
        name: this.editName().trim() || c.name,
        lastName: this.editLastName().trim() || c.lastName,
        phone: this.editPhone().trim() || c.phone,
        email: this.editEmail().trim() || c.email || '',
        tags: c.tags,
        notes: this.editNotes() || c.notes || '',
        photo: photo
      });
      this.closeCameraModal();
    }
  }

  removePhoto() {
    const c = this.customer();
    if (c && c.id) {
      this.editPhoto.set('');
      this.save.emit({
        id: c.id,
        name: this.editName().trim() || c.name,
        lastName: this.editLastName().trim() || c.lastName,
        phone: this.editPhone().trim() || c.phone,
        email: this.editEmail().trim() || c.email || '',
        tags: c.tags,
        notes: this.editNotes() || c.notes || '',
        photo: ''
      });
      this.closeCameraModal();
    }
  }

  onFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          this.capturedPhoto.set(result);
          this.stopCameraStream();
        }
      };
      reader.readAsDataURL(file);
    }
  }

  private stopCameraStream() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.isCameraActive.set(false);
  }

  confirmDelete() {
    const c = this.customer();
    if (c.id) {
      this.deleteCustomer.emit(c.id);
    }
  }

  startEditVisit(visit: Visit) {
    if (visit.id) {
      this.editingVisitId.set(visit.id);
      this.currentEditVisitNote.set(visit.note || '');
    }
  }

  cancelEditVisit() {
    this.editingVisitId.set(null);
    this.currentEditVisitNote.set('');
  }

  saveVisit(visit: Visit) {
    if (visit.id) {
      this.updateVisitNote.emit({
        id: visit.id,
        note: this.currentEditVisitNote()
      });
      this.editingVisitId.set(null);
      this.currentEditVisitNote.set('');
    }
  }

  copiedFormula = signal(false);

  // Quick preset tags for hairdressers to insert with 1 tap
  readonly presetFormulaTags = [
    { label: 'K: (Korienky)', insert: 'K: ' },
    { label: 'D: (Dĺžky)', insert: ' | D: ' },
    { label: 'Ton: (Toner)', insert: ' | Ton: ' },
    { label: 'Nová:', insert: ' | NOVÁ: ' },
    { label: '3% Oxi', insert: ' + 3% oxi' },
    { label: '6% Oxi', insert: ' + 6% oxi' },
    { label: '9% Oxi', insert: ' + 9% oxi' },
    { label: '12% Oxi', insert: ' + 12% oxi' },
    { label: 'Green', insert: ' + green' },
  ];

  appendPresetTag(text: string) {
    const current = this.editNotes() || '';
    if (!current) {
      this.editNotes.set(text.trim());
    } else {
      this.editNotes.set(current + text);
    }
  }

  copyFormulaToClipboard(formulaText: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(formulaText);
      this.copiedFormula.set(true);
      setTimeout(() => this.copiedFormula.set(false), 2000);
    }
  }

  get parsedFormulaParts() {
    const notes = this.customer()?.notes;
    if (!notes) return [];

    const rawParts = notes.split(/[|\n;]/).map(p => p.trim()).filter(p => p.length > 0);
    return rawParts.map(part => {
      let type: 'roots' | 'lengths' | 'middle' | 'new' | 'general' = 'general';
      let title = 'Receptúra / Poznámka';
      let content = part;

      const lower = part.toLowerCase();
      if (lower.startsWith('k:') || lower.startsWith('korienky')) {
        type = 'roots';
        title = 'Korienky (Roots)';
        content = part.replace(/^(k:|korienky:?)/i, '').trim();
      } else if (lower.startsWith('d:') || lower.startsWith('dĺžky') || lower.startsWith('dlzky')) {
        type = 'lengths';
        title = 'Dĺžky / Končeky';
        content = part.replace(/^(d:|dĺžky:?|dlzky:?)/i, '').trim();
      } else if (lower.startsWith('s:') || lower.startsWith('stred')) {
        type = 'middle';
        title = 'Stred';
        content = part.replace(/^(s:|stred:?)/i, '').trim();
      } else if (lower.startsWith('nová:') || lower.startsWith('nova:')) {
        type = 'new';
        title = 'Nová receptúra';
        content = part.replace(/^(nová:|nova:?)/i, '').trim();
      } else if (lower.startsWith('ton:') || lower.startsWith('toner:') || lower.startsWith('tonovačka:')) {
        type = 'middle';
        title = 'Tónovanie / Toner';
        content = part.replace(/^(ton:|toner:|tonovačka:)/i, '').trim();
      } else if (lower.startsWith('celé vlasy:') || lower.startsWith('celá hlava:')) {
        type = 'roots';
        title = 'Celé vlasy / Hlava';
        content = part.replace(/^(celé vlasy:|celá hlava:)/i, '').trim();
      }

      // Extract shade tokens (numbers like 6,14 or 6.14 or 7 or 10.21 or special words like green, 000ss, 12% oxi)
      const shadeTokens = this.extractShadeTokens(content);

      return { type, title, content, original: part, shades: shadeTokens };
    });
  }

  private extractShadeTokens(text: string) {
    const tokens: { label: string; color: string; isDeveloper?: boolean }[] = [];
    const rawTokens = text.split(/[\s,+-/]/).map(t => t.trim()).filter(t => t.length > 0);

    for (const raw of rawTokens) {
      const lower = raw.toLowerCase();
      if (lower.includes('%') || lower.includes('oxi') || lower.includes('vol')) {
        tokens.push({ label: raw, color: '#e2e8f0', isDeveloper: true });
        continue;
      }
      if (lower === 'green' || lower === 'zelená') {
        tokens.push({ label: 'Green', color: '#10b981' });
        continue;
      }
      if (lower === '000ss' || lower === 'boost') {
        tokens.push({ label: raw, color: '#faf5ff' });
        continue;
      }

      // Check if shade format e.g. 6.00 or 7,21 or 3-4 or 5
      const cleanNum = raw.replace(',', '.');
      if (/^\d+(\.\d+)?$/.test(cleanNum)) {
        const shadeColor = this.getShadeColor(cleanNum);
        tokens.push({ label: raw, color: shadeColor });
      }
    }
    return tokens;
  }

  getShadeColor(numStr: string): string {
    const val = parseFloat(numStr);
    if (isNaN(val)) return '#d8b589';

    // Base Hair Level Swatches
    const level = Math.floor(val);
    let baseColor = '#5c3a28'; // Default mid brown

    if (level <= 2) baseColor = '#171717';
    else if (level === 3) baseColor = '#2d1e18';
    else if (level === 4) baseColor = '#42281d';
    else if (level === 5) baseColor = '#5c3a28';
    else if (level === 6) baseColor = '#805335';
    else if (level === 7) baseColor = '#a8754b';
    else if (level === 8) baseColor = '#cf9f6e';
    else if (level === 9) baseColor = '#e8c28d';
    else if (level >= 10) baseColor = '#fae6ba';

    // Check tone nuance (after decimal)
    const decimals = numStr.split('.')[1] || '';
    if (decimals.startsWith('1')) {
      // Ash / Cool
      return level >= 8 ? '#d3d5db' : '#5e5a56';
    } else if (decimals.startsWith('2')) {
      // Violet / Iris / Pearl
      return level >= 8 ? '#ebd7f5' : '#6b4d70';
    } else if (decimals.startsWith('3')) {
      // Gold / Warm
      return level >= 8 ? '#fada7a' : '#99732b';
    } else if (decimals.startsWith('4')) {
      // Copper
      return level >= 8 ? '#f79f59' : '#b34d15';
    } else if (decimals.startsWith('5')) {
      // Mahogany
      return level >= 8 ? '#e67385' : '#822433';
    } else if (decimals.startsWith('6')) {
      // Red
      return level >= 8 ? '#f05454' : '#a81313';
    }

    return baseColor;
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
}
