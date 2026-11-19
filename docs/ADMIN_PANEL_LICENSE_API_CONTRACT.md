# School OS Central Backend — Platform Admin Licensing API Contract

**Document Version:** 1.0.0 (Phase 6 Approved)  
**Consumer Target:** Platform Admin Panel (`school-os-admin-panel`)  
**Base Route:** `/api/v1`  
**Authentication:** Bearer JWT (Platform Admin / Owner Context)  

---

## 1. Overview & Integration Purpose

This document specifies the backend APIs implemented in Phase 6 to enable future platform admin-panel updates. Platform owners can manage subscription plans, enforce device seats, inspect activations, and manage backups without backend code changes.

---

## 2. Plan Management Endpoints

### 2.1. List Commercial Plans
- **Route:** `GET /api/v1/platform/plans`
- **Auth:** Platform Admin
- **Response:** Array of published plans with pricing, subscriber count, and limits (`maxStudents`, `maxDevices`, `offlineGraceDays`).

### 2.2. Create or Update Plan Draft
- **Route:** `POST /api/v1/platform/plans`
- **Auth:** Platform Owner
- **Body:**
  ```json
  {
    "code": "enterprise_desktop",
    "name": "Enterprise Campus Plan",
    "priceMonthlyPkr": 15000,
    "features": [
      "core.school_admin", "core.students", "core.fees", "core.academics",
      "core.examinations", "core.payroll", "core.timetable", "core.reports",
      "core.cloud_sync", "core.cloud_backup"
    ],
    "limits": {
      "maxStudents": 2500,
      "maxDevices": 5,
      "offlineGraceDays": 14
    },
    "publish": true
  }
  ```

---

## 3. Workstation Device & Licensing Endpoints

### 3.1. List School Registered Workstations
- **Route:** `GET /api/v1/licensing/devices`
- **Auth:** School Admin or Platform Owner
- **Response:**
  ```json
  [
    {
      "licenseId": "lic_9e8a7b6c5d4e...",
      "deviceId": "dev_win_ws_01",
      "deviceName": "Principal-Office-PC",
      "status": "active",
      "issuedAt": "2026-11-14T08:00:00.000Z",
      "expiresAt": "2027-11-14T08:00:00.000Z",
      "lastVerifiedAt": "2026-11-14T08:30:00.000Z",
      "platform": "windows_desktop"
    }
  ]
  ```

### 3.2. Revoke Device License
- **Route:** `POST /api/v1/licensing/devices/:deviceId/revoke`
- **Auth:** School Admin or Platform Owner
- **Body:**
  ```json
  {
    "reason": "Decommissioned old computer"
  }
  ```

---

## 4. School Cloud Backups Endpoints

### 4.1. List School Cloud Backups
- **Route:** `GET /api/v1/backups/school`
- **Auth:** School Admin (or Platform Owner via tenant switch)
- **Response:**
  ```json
  [
    {
      "backupId": "sbak_8f0a1b2c3d...",
      "deviceId": "dev_win_ws_01",
      "fileName": "sms-backup-2026-11-14.enc.bak",
      "fileSizeBytes": 425890,
      "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "isEncrypted": true,
      "encryptionAlgorithm": "aes-256-gcm",
      "schemaVersion": 8,
      "triggerType": "manual",
      "status": "completed",
      "createdAt": "2026-11-14T08:15:00.000Z"
    }
  ]
  ```

### 4.2. Download Cloud Backup Binary Data
- **Route:** `GET /api/v1/backups/school/:backupId/download`
- **Auth:** School Admin
- **Response:** Encrypted binary stream or Base64 payload.
