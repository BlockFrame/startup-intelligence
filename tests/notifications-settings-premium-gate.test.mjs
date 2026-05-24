import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve('src/services/notifications-settings.ts'), 'utf8');

describe('notification settings premium gate', () => {
  it('uses the shared premium gate so tester keys unlock notifications', () => {
    assert.ok(
      src.includes("import { hasPremiumAccess } from '@/services/panel-gating';"),
      'notifications settings must use shared premium gate',
    );
    assert.ok(
      src.includes('const isPro = hasPremiumAccess();'),
      'notifications settings must unlock with tester/API/Clerk premium access',
    );
    assert.ok(
      !src.includes('const isPro = !!host.isSignedIn && hasTier(1);'),
      'notifications settings must not require Clerk sign-in when tester key is present',
    );
  });
});
