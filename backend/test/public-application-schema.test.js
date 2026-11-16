import test from 'node:test';
import assert from 'node:assert/strict';
import { publicApplicationSchema } from '../src/services/public-application-schema.js';

const validApplication = {
  requestId: '00000000-0000-4000-8000-000000000001',
  fullName: 'Alex Postulante',
  documentNumber: '12345678',
  privacyConsent: 'true',
  privacyNoticeVersion: '2026-11-v1',
};

test('accepts an official public application with privacy consent and notice version', () => {
  const result = publicApplicationSchema.safeParse(validApplication);

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.email, '');
    assert.equal(result.data.phone, '');
  }
});

test('rejects a public application without explicit privacy consent', () => {
  assert.equal(publicApplicationSchema.safeParse({
    ...validApplication,
    privacyConsent: 'false',
  }).success, false);
});

test('rejects a public application without a privacy notice version', () => {
  assert.equal(publicApplicationSchema.safeParse({
    ...validApplication,
    privacyNoticeVersion: undefined,
  }).success, false);
});
