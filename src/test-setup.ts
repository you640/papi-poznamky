import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// Mock IndexedDB for Dexie
/* eslint-disable @typescript-eslint/no-explicit-any */
(global as any).indexedDB = indexedDB;
(global as any).IDBKeyRange = IDBKeyRange;
/* eslint-enable @typescript-eslint/no-explicit-any */

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);
