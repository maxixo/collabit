# Share Docs Functionality - Comprehensive Test Checklist

## Document Information
- **Feature**: Share Documents
- **Components Tested**: ShareModal, shareToken service, API endpoints, permission system
- **Test Types**: Manual, Automated (unit/integration/e2e)
- **Last Updated**: January 31, 2026

---

## Table of Contents
1. [UI Testing - ShareModal Component](#ui-testing---sharemodal-component)
2. [API Endpoint Testing](#api-endpoint-testing)
3. [Service Layer Testing](#service-layer-testing)
4. [Permission & Access Control](#permission--access-control)
5. [Edge Cases & Error Handling](#edge-cases--error-handling)
6. [Integration Testing](#integration-testing)
7. [Security Testing](#security-testing)
8. [Performance Testing](#performance-testing)

---

## 1. UI Testing - ShareModal Component

### 1.1 Modal Rendering & Display
- [ ] Modal opens correctly when triggered
- [ ] Modal displays with correct title: "Share this document"
- [ ] Modal displays description text: "Invite collaborators with a share link."
- [ ] Share icon displays correctly in header
- [ ] Close button (X) is visible and functional
- [ ] Modal backdrop is visible and dark/blurred
- [ ] Modal is centered on screen
- [ ] Modal has proper width (max-w-xl) and responsive behavior

### 1.2 Share Settings - Permission Level
- [ ] Permission dropdown is visible
- [ ] Permission label is displayed: "Permission level"
- [ ] "Viewer (read-only)" option is available and selectable
- [ ] "Editor (can edit)" option is available and selectable
- [ ] Selected permission persists after selection
- [ ] Permission value changes state correctly

### 1.3 Share Settings - Expiration Options
- [ ] Expiration dropdown is visible
- [ ] Expiration label is displayed: "Expiration"
- [ ] "Never" option is available and selectable (default)
- [ ] "7 days" option is available and selectable
- [ ] "30 days" option is available and selectable
- [ ] "Custom" option is available and selectable
- [ ] Custom expiration date input appears when "Custom" is selected
- [ ] Custom date input has min attribute set to today's date
- [ ] Custom date input accepts valid dates
- [ ] Invalid dates are rejected (shows error message)
- [ ] Past dates are rejected (min attribute validation)

### 1.4 Share Settings - Max Uses Options
- [ ] Max uses dropdown is visible
- [ ] Max uses label is displayed: "Max uses"
- [ ] "Unlimited" option is available and selectable (default)
- [ ] "10 uses" option is available and selectable
- [ ] "50 uses" option is available and selectable
- [ ] "100 uses" option is available and selectable
- [ ] "Custom" option is available and selectable
- [ ] Custom max uses input appears when "Custom" is selected
- [ ] Custom input has min attribute set to 1
- [ ] Custom input accepts valid positive integers
- [ ] Zero or negative values are rejected (shows error message)
- [ ] Non-numeric values are rejected

### 1.5 Generate Link Functionality
- [ ] "Generate link" button is visible
- [ ] Button displays "Generate link" text initially
- [ ] Button displays "Generating..." while processing
- [ ] Button is disabled during generation
- [ ] Success: Generated link section appears after generation
- [ ] Generated link is displayed in read-only input field
- [ ] Link is clickable/focusable
- [ ] Clicking on link field selects all text
- [ ] Error messages display for invalid inputs
- [ ] Error: "Select a valid expiration date" for invalid custom date
- [ ] Error: "Enter a valid max uses value" for invalid custom max uses
- [ ] Error: "Failed to generate share link" for API failures

### 1.6 Copy Link Functionality
- [ ] "Copy link" button is visible in generated link section
- [ ] Button displays "Copy link" text initially
- [ ] Button displays "Copied" after successful copy
- [ ] Button icon changes from "content_copy" to "check" after copy
- [ ] Copy button reverts to original state after 2 seconds
- [ ] Link is copied to clipboard correctly
- [ ] Paste functionality works after copy
- [ ] Multiple copy attempts work correctly
- [ ] Copy button works even if another token was just copied

### 1.7 Active Share Links Display
- [ ] "Active share links" section is visible
- [ ] "Refresh" button is visible and functional
- [ ] Refresh button displays "Refreshing..." while loading
- [ ] "No active share links yet." message displays when empty
- [ ] Active tokens are listed in reverse chronological order
- [ ] Each token card displays:
  - [ ] Permission level (Viewer/Editor access)
  - [ ] Expiration date (formatted: MM/DD/YYYY or "Never")
  - [ ] Usage count (e.g., "5 / 10" or "5 / unlimited")
  - [ ] Revoke button
  - [ ] Link input field
  - [ ] Copy button for individual token

### 1.8 Revoke Link Functionality
- [ ] "Revoke link" button is visible on each token card
- [ ] Button displays red/warning styling
- [ ] Button displays "Revoke link" text initially
- [ ] Button displays "Revoking..." while processing
- [ ] Button is disabled during revocation
- [ ] Token is removed from active list after revocation
- [ ] Error messages display for failed revocations
- [ ] If revoked token was the generated token, it's cleared

### 1.9 Modal Controls
- [ ] "Close" button at bottom right works
- [ ] Clicking backdrop closes modal
- [ ] Pressing Escape key closes modal (if implemented)
- [ ] Modal closes after successful link generation (optional)
- [ ] Modal state resets when reopened for different document

### 1.10 Responsive Design
- [ ] Modal displays correctly on mobile screens (< 640px)
- [ ] Inputs stack vertically on mobile
- [ ] Buttons remain accessible on mobile
- [ ] Text remains readable on mobile
- [ ] Modal fits within viewport on small screens

### 1.11 Dark Mode
- [ ] Modal displays correctly in dark mode
- [ ] Background color changes appropriately
- [ ] Text colors remain readable
- [ ] Input fields have proper dark mode styling
- [ ] Buttons maintain contrast in dark mode

---

## 2. API Endpoint Testing

### 2.1 POST /api/documents/:id/share (Generate Share Token)

**Authentication Tests:**
- [ ] **Test**: Request without authentication → Expect: 401 Unauthorized
- [ ] **Test**: Request with invalid token → Expect: 401 Unauthorized
- [ ] **Test**: Request with valid authentication → Expect: 201 Created (success)

**Authorization Tests:**
- [ ] **Test**: Owner generates share token → Expect: 201 Created
- [ ] **Test**: Editor generates share token → Expect: 201 Created
- [ ] **Test**: Viewer attempts to generate share token → Expect: 403 Forbidden
- [ ] **Test**: Non-member attempts to generate share token → Expect: 403 Forbidden

**Input Validation Tests:**
- [ ] **Test**: Missing workspaceId in query → Expect: 400 Bad Request
- [ ] **Test**: Invalid permission value (e.g., "admin") → Expect: 400 Bad Request
- [ ] **Test**: Invalid permission type (e.g., number) → Expect: 400 Bad Request
- [ ] **Test**: Invalid expiration format (not ISO string) → Expect: 400 Bad Request
- [ ] **Test**: Invalid maxUses type (e.g., string) → Expect: 400 Bad Request
- [ ] **Test**: Negative maxUses value → Expect: 400 Bad Request
- [ ] **Test**: Zero maxUses value → Expect: 400 Bad Request
- [ ] **Test**: Non-integer maxUses value (e.g., 5.5) → Expect: 400 Bad Request
- [ ] **Test**: Past expiration date → Expect: 201 Created (valid input, though unusual)
- [ ] **Test**: Empty string for permission → Expect: 400 Bad Request

**Success Cases:**
- [ ] **Test**: Generate token with viewer permission only → Expect: 201 with shareToken
- [ ] **Test**: Generate token with editor permission only → Expect: 201 with shareToken
- [ ] **Test**: Generate token with "never" expiration → Expect: 201 with shareToken (expirationDate: null)
- [ ] **Test**: Generate token with 7-day expiration → Expect: 201 with shareToken (correct expirationDate)
- [ ] **Test**: Generate token with 30-day expiration → Expect: 201 with shareToken (correct expirationDate)
- [ ] **Test**: Generate token with custom expiration → Expect: 201 with shareToken (correct expirationDate)
- [ ] **Test**: Generate token with unlimited max uses → Expect: 201 with shareToken (maxUses: null)
- [ ] **Test**: Generate token with 10 max uses → Expect: 201 with shareToken (maxUses: 10)
- [ ] **Test**: Generate token with custom max uses → Expect: 201 with shareToken (correct maxUses)
- [ ] **Test**: Generate token with all options combined → Expect: 201 with complete shareToken
- [ ] **Test**: Generate multiple tokens for same document → Expect: Each succeeds with unique token

**Response Validation:**
- [ ] **Test**: Response contains shareToken object
- [ ] **Test**: shareToken contains id (UUID format)
- [ ] **Test**: shareToken contains token (UUID format)
- [ ] **Test**: shareToken contains documentId (matches request)
- [ ] **Test**: shareToken contains createdBy (matches authenticated user)
- [ ] **Test**: shareToken contains permissionLevel (matches request or defaults to "viewer")
- [ ] **Test**: shareToken contains expirationDate (matches request or null)
- [ ] **Test**: shareToken contains maxUses (matches request or null)
- [ ] **Test**: shareToken contains useCount (initially 0)
- [ ] **Test**: shareToken contains createdAt (ISO timestamp)

### 2.2 GET /api/documents/:id/share-tokens (List Active Tokens)

**Authentication Tests:**
- [ ] **Test**: Request without authentication → Expect: 401 Unauthorized
- [ ] **Test**: Request with valid authentication → Expect: 200 OK

**Authorization Tests:**
- [ ] **Test**: Owner requests tokens → Expect: 200 OK with tokens array
- [ ] **Test**: Editor requests tokens → Expect: 200 OK with tokens array
- [ ] **Test**: Viewer attempts to request tokens → Expect: 403 Forbidden
- [ ] **Test**: Non-member attempts to request tokens → Expect: 403 Forbidden

**Input Validation Tests:**
- [ ] **Test**: Missing workspaceId in query → Expect: 400 Bad Request

**Success Cases:**
- [ ] **Test**: Document with no tokens → Expect: 200 with empty tokens array
- [ ] **Test**: Document with one active token → Expect: 200 with one token
- [ ] **Test**: Document with multiple active tokens → Expect: 200 with multiple tokens
- [ ] **Test**: Tokens ordered by createdAt DESC → Expect: Newest first
- [ ] **Test**: Expired tokens excluded from list → Expect: Only active tokens returned
- [ ] **Test**: Max uses exhausted tokens excluded → Expect: Only active tokens returned
- [ ] **Test**: Mixed active and expired tokens → Expect: Only active tokens returned

**Response Validation:**
- [ ] **Test**: Response contains tokens array
- [ ] **Test**: Each token has all required fields (id, token, documentId, createdBy, permissionLevel, expirationDate, maxUses, useCount, createdAt)
- [ ] **Test**: Tokens have correct documentId
- [ ] **Test**: Token counts match expected active tokens

### 2.3 DELETE /api/documents/share/:token (Revoke Share Token)

**Authentication Tests:**
- [ ] **Test**: Request without authentication → Expect: 401 Unauthorized
- [ ] **Test**: Request with valid authentication → Expect: 200 OK (success)

**Authorization Tests:**
- [ ] **Test**: Owner revokes token → Expect: 200 OK
- [ ] **Test**: Editor revokes token → Expect: 200 OK
- [ ] **Test**: Viewer attempts to revoke token → Expect: 403 Forbidden
- [ ] **Test**: Non-member attempts to revoke token → Expect: 403 Forbidden

**Input Validation Tests:**
- [ ] **Test**: Missing/empty token in URL → Expect: 400 Bad Request
- [ ] **Test**: Missing workspaceId in query → Expect: 400 Bad Request

**Success Cases:**
- [ ] **Test**: Revoke existing token → Expect: 200 with { token, revoked: true }
- [ ] **Test**: Token no longer accessible after revocation
- [ ] **Test**: Token removed from share_tokens table

**Error Cases:**
- [ ] **Test**: Attempt to revoke non-existent token → Expect: 404 Not Found
- [ ] **Test**: Attempt to revoke already revoked token → Expect: 404 Not Found

### 2.4 GET /api/documents/share/:token (Validate Share Token)

**Authentication Tests:**
- [ ] **Test**: Request without authentication → Expect: 200 OK (public endpoint for share validation)
- [ ] **Test**: Request with authentication → Expect: 200 OK

**Validation Tests:**
- [ ] **Test**: Valid token → Expect: 200 with shareToken and incremented useCount
- [ ] **Test**: Non-existent token → Expect: 404 Not Found with message "Share token not found"
- [ ] **Test**: Expired token → Expect: 410 Gone with message "Share token expired"
- [ ] **Test**: Token at max uses limit → Expect: 410 Gone with message "Share token has reached its usage limit"

**Increment Tests:**
- [ ] **Test**: First use increments useCount from 0 to 1
- [ ] **Test**: Second use increments useCount from 1 to 2
- [ ] **Test**: useCount increments correctly on each access
- [ ] **Test**: Token at maxUses - 1 allows one more access
- [ ] **Test**: Token at maxUses rejects subsequent access

**Edge Cases:**
- [ ] **Test**: Token with null expiration (never expires) → Expect: Valid forever
- [ ] **Test**: Token with null maxUses (unlimited uses) → Expect: Valid forever
- [ ] **Test**: Token with expiration in past → Expect: Expired
- [ ] **Test**: Concurrent requests for same token → Expect: Proper increment handling

**Response Validation:**
- [ ] **Test**: Response contains updated shareToken object
- [ ] **Test**: shareToken.useCount is incremented
- [ ] **Test**: Other token fields remain unchanged
- [ ] **Test**: Error responses include descriptive message

---

## 3. Service Layer Testing

### 3.1 generateShareToken()

**Parameter Validation Tests:**
- [ ] **Test**: Invalid permission level → Should default to "viewer"
- [ ] **Test**: Valid permission levels (viewer, editor) → Should use provided value
- [ ] **Test**: Empty string expiration → Should set to null
- [ ] **Test**: Valid ISO string expiration → Should store as provided
- [ ] **Test**: Null expiration → Should store as null
- [ ] **Test**: Undefined expiration → Should store as null
- [ ] **Test**: Valid maxUses (positive integer) → Should store as provided
- [ ] **Test**: Invalid maxUses (negative) → Should set to null
- [ ] **Test**: Invalid maxUses (zero) → Should set to null
- [ ] **Test**: Invalid maxUses (non-integer) → Should set to null
- [ ] **Test**: Null maxUses → Should store as null
- [ ] **Test**: Undefined maxUses → Should store as null

**Database Operation Tests:**
- [ ] **Test**: Token inserted into share_tokens table
- [ ] **Test**: Generated id is valid UUID
- [ ] **Test**: Generated token is valid UUID (different from id)
- [ ] **Test**: documentId stored correctly
- [ ] **Test**: createdBy stored correctly
- [ ] **Test**: permissionLevel stored correctly
- [ ] **Test**: expirationDate stored correctly (as timestamp)
- [ ] **Test**: maxUses stored correctly
- [ ] **Test**: useCount initialized to 0
- [ ] **Test**: createdAt set to current timestamp

**Return Value Tests:**
- [ ] **Test**: Returns ShareToken object
- [ ] **Test**: All fields mapped correctly from database row
- [ ] **Test**: id field correct
- [ ] **Test**: token field correct
- [ ] **Test**: documentId field correct
- [ ] **Test**: createdBy field correct
- [ ] **Test**: permissionLevel field correct
- [ ] **Test**: expirationDate field correct
- [ ] **Test**: maxUses field correct
- [ ] **Test**: useCount field correct (0)
- [ ] **Test**: createdAt field correct

### 3.2 getShareTokenByToken()

**Query Tests:**
- [ ] **Test**: Existing token → Returns ShareToken object
- [ ] **Test**: Non-existent token → Returns null
- [ ] **Test**: Empty token string → Returns null

**Return Value Tests:**
- [ ] **Test**: All fields mapped correctly from database row
- [ ] **Test**: useCount reflects actual database value
- [ ] **Test**: Handles both camelCase and snake_case column names

### 3.3 validateShareToken()

**Validation Logic Tests:**
- [ ] **Test**: Non-existent token → Returns { valid: false, reason: "not_found" }
- [ ] **Test**: Valid token with no expiration and no maxUses → Returns { valid: true, token }
- [ ] **Test**: Valid token with future expiration → Returns { valid: true, token }
- [ ] **Test**: Token with past expiration → Returns { valid: false, reason: "expired" }
- [ ] **Test**: Token with invalid expiration date format → Should treat as no expiration
- [ ] **Test**: Token below maxUses limit → Returns { valid: true, token }
- [ ] **Test**: Token at maxUses limit → Returns { valid: false, reason: "max_uses" }
- [ ] **Test**: Token above maxUses limit → Returns { valid: false, reason: "max_uses" }
- [ ] **Test**: Expired and max uses exceeded → Returns { valid: false, reason: "expired" } (first check)
- [ ] **Test**: Token with null expirationDate → Should never expire
- [ ] **Test**: Token with null maxUses → Should have unlimited uses

**Edge Cases:**
- [ ] **Test**: Expiration exactly at current time → Should be considered expired
- [ ] **Test**: Expiration one millisecond in future → Should be valid
- [ ] **Test**: useCount = maxUses - 1 → Should be valid
- [ ] **Test**: useCount = maxUses → Should be invalid

### 3.4 incrementTokenUsage()

**Update Tests:**
- [ ] **Test**: Valid token increments useCount by 1
- [ ] **Test**: Returns updated ShareToken with new useCount
- [ ] **Test**: Non-existent token → Returns null
- [ ] **Test**: Token at maxUses limit → Update fails, returns null
- [ ] **Test**: Expired token → Update fails, returns null
- [ ] **Test**: Token with both conditions (expired and maxUses) → Update fails, returns null

**Database Constraints:**
- [ ] **Test**: WHERE clause checks: token exists
- [ ] **Test**: WHERE clause checks: useCount < maxUses (if maxUses not null)
- [ ] **Test**: WHERE clause checks: expirationDate > NOW() (if expirationDate not null)
- [ ] **Test**: Multiple concurrent increments → Each increments correctly

### 3.5 revokeShareToken()

**Delete Tests:**
- [ ] **Test**: Existing token → Returns true, token deleted
- [ ] **Test**: Non-existent token → Returns false
- [ ] **Test**: Token no longer queryable after revocation

**Return Value Tests:**
- [ ] **Test**: Returns true when rowCount > 0
- [ ] **Test**: Returns false when rowCount = 0

### 3.6 listActiveShareTokens()

**Query Tests:**
- [ ] **Test**: Document with no tokens → Returns empty array
- [ ] **Test**: Document with one active token → Returns array with one token
- [ ] **Test**: Document with multiple active tokens → Returns array with all active tokens
- [ ] **Test**: Tokens ordered by createdAt DESC (newest first)
- [ ] **Test**: Expired tokens excluded from results
- [ ] **Test**: Max uses exhausted tokens excluded from results
- [ ] **Test**: Mixed active/inactive tokens → Only active returned

**WHERE Clause Validation:**
- [ ] **Test**: Filters by documentId
- [ ] **Test**: Filters out expired tokens (expirationDate > NOW() or null)
- [ ] **Test**: Filters out max uses exhausted tokens (useCount < maxUses or maxUses IS NULL)
- [ ] **Test**: Includes tokens with null expirationDate
- [ ] **Test**: Includes tokens with null maxUses

### 3.7 mapShareTokenRow() (Helper Function)

**Field Mapping Tests:**
- [ ] **Test**: Maps camelCase columns correctly
- [ ] **Test**: Maps snake_case columns correctly
- [ ] **Test**: Handles mixed camelCase/snake_case rows
- [ ] **Test**: Defaults permissionLevel to "viewer" if invalid
- [ ] **Test**: Validates permissionLevel against allowed values

**Type Conversion Tests:**
- [ ] **Test**: Converts Date objects to ISO strings
- [ ] **Test**: Handles string timestamps
- [ ] **Test**: Returns null for invalid timestamps
- [ ] **Test**: Converts numeric maxUses to number
- [ ] **Test**: Converts string maxUses to number
- [ ] **Test**: Returns null for invalid maxUses
- [ ] **Test**: Converts numeric useCount to number
- [ ] **Test**: Converts string useCount to number
- [ ] **Test**: Defaults useCount to 0 if invalid

---

## 4. Permission & Access Control

### 4.1 Permission Levels

**Viewer Permission:**
- [ ] **Test**: Viewer can view document content → Expect: 200 OK
- [ ] **Test**: Viewer can read document → Expect: 200 OK
- [ ] **Test**: Viewer cannot edit document → Expect: 403 Forbidden
- [ ] **Test**: Viewer cannot share document → Expect: 403 Forbidden
- [ ] **Test**: Viewer cannot revoke share tokens → Expect: 403 Forbidden
- [ ] **Test**: Viewer cannot delete document → Expect: 403 Forbidden
- [ ] **Test**: Viewer cannot move document to trash → Expect: 403 Forbidden
- [ ] **Test**: Viewer can see document in list → Expect: Included

**Editor Permission:**
- [ ] **Test**: Editor can view document content → Expect: 200 OK
- [ ] **Test**: Editor can read document → Expect: 200 OK
- [ ] **Test**: Editor can edit document → Expect: 200 OK
- [ ] **Test**: Editor can share document → Expect: 201 Created
- [ ] **Test**: Editor can revoke share tokens → Expect: 200 OK
- [ ] **Test**: Editor cannot delete document → Expect: 403 Forbidden
- [ ] **Test**: Editor cannot move document to trash → Expect: 403 Forbidden
- [ ] **Test**: Editor can see document in list → Expect: Included

**Owner Permission:**
- [ ] **Test**: Owner can view document content → Expect: 200 OK
- [ ] **Test**: Owner can read document → Expect: 200 OK
- [ ] **Test**: Owner can edit document → Expect: 200 OK
- [ ] **Test**: Owner can share document → Expect: 201 Created
- [ ] **Test**: Owner can revoke share tokens → Expect: 200 OK
- [ ] **Test**: Owner can delete document → Expect: 200 OK
- [ ] **Test**: Owner can move document to trash → Expect: 200 OK
- [ ] **Test**: Owner can see document in list → Expect: Included

### 4.2 Share Token Permission Enforcement

**Viewer Share Token:**
- [ ] **Test**: User accesses document via viewer token → Auto-joins as viewer
- [ ] **Test**: Viewer token user can read → Expect: 200 OK
- [ ] **Test**: Viewer token user cannot edit → Expect: 403 Forbidden
- [ ] **Test**: Viewer token user cannot share → Expect: 403 Forbidden

**Editor Share Token:**
- [ ] **Test**: User accesses document via editor token → Auto-joins as editor
- [ ] **Test**: Editor token user can read → Expect: 200 OK
- [ ] **Test**: Editor token user can edit → Expect: 200 OK
- [ ] **Test**: Editor token user cannot delete → Expect: 403 Forbidden

### 4.3 Auto-Join Functionality

**Join Scenarios:**
- [ ] **Test**: First-time access via share token → User added to document_members
- [ ] **Test**: User role matches share token permission level
- [ ] **Test**: Second access by same user → No duplicate entry in document_members
- [ ] **Test**: Access with different token levels → Role updated to match new token
- [ ] **Test**: Auto-join preserves existing membership if already a member

**Integration with validateDocumentAccessWithShare:**
- [ ] **Test**: Share token validation grants access
- [ ] **Test**: Access source marked as "share"
- [ ] **Test**: WorkspaceId extracted from share token context
- [ ] **Test**: Permission level applied from share token

### 4.4 Role Checks

**canEditDocument() Function:**
- [ ] **Test**: Owner → Returns true
- [ ] **Test**: Editor → Returns true
- [ ] **Test**: Viewer → Returns false
- [ ] **Test**: No role → Returns false

**getDocumentRole() Function:**
- [ ] **Test**: Owner of document → Returns "owner"
- [ ] **Test**: Editor member → Returns "editor"
- [ ] **Test**: Viewer member → Returns "viewer"
- [ ] **Test**: Non-member → Returns null/undefined

---

## 5. Edge Cases & Error Handling

### 5.1 Database Edge Cases

**Concurrent Operations:**
- [ ] **Test**: Multiple users generate tokens simultaneously → All succeed
- [ ] **Test**: Concurrent increment operations on same token → Correct final useCount
- [ ] **Test**: Concurrent validation and revocation → Proper handling
- [ ] **Test**: Race condition: validate and increment reach max uses simultaneously → Only one succeeds

**Data Integrity:**
- [ ] **Test**: Token references non-existent documentId → Should fail gracefully
- [ ] **Test**: Token references deleted document → Should fail gracefully
- [ ] **Test**: Malformed UUID in token column → Should handle gracefully
- [ ] **Test**: Corrupted timestamp data → Should handle gracefully

### 5.2 Input Edge Cases

**Boundary Values:**
- [ ] **Test**: maxUses = 1 → Should allow exactly one use
- [ ] **Test**: maxUses = 1 → Second access should fail
- [ ] **Test**: Expiration = current time + 1ms → Should be valid
- [ ] **Test**: Expiration = current time - 1ms → Should be expired
- [ ] **Test**: Very large maxUses value (e.g., 999999999) → Should work
- [ ] **Test**: Very far future expiration (e.g., 100 years) → Should work

**Malformed Input:**
- [ ] **Test**: Invalid UUID format in token → Returns not_found
- [ ] **Test**: SQL injection attempts → Should be sanitized
- [ ] **Test**: XSS attempts in parameters → Should be sanitized
- [ ] **Test**: Unicode characters in workspaceId → Should work correctly
- [ ] **Test**: Special characters in documentId → Should work correctly

### 5.3 Network Edge Cases

**Timeout Scenarios:**
- [ ] **Test**: Slow database response → Should handle gracefully
- [ ] **Test**: Network timeout during token generation → Should not create partial token
- [ ] **Test**: Network timeout during token validation → Should not increment useCount

**Retry Scenarios:**
- [ ] **Test**: Failed token generation retry → Should not create duplicate tokens
- [ ] **Test**: Failed increment retry → Should not double-increment

### 5.4 State Edge Cases

**Token Lifecycle:**
- [ ] **Test**: Token used exactly at expiration moment → Behavior should be deterministic
- [ ] **Test**: Token used exactly at maxUses limit → Should reject
- [ ] **Test**: Multiple tokens for same document, some expired → Only active returned
- [ ] **Test**: All tokens expired → Empty list returned

**User State:**
- [ ] **Test**: User already member with higher role than token → Keep higher role
- [ ] **Test**: User already member with lower role than token → Update to higher role
- [ ] **Test**: User accesses via multiple different tokens → Role should match latest valid access

### 5.5 Error Messages

**User-Facing Errors:**
- [ ] **Test**: "Share token not found" → Clear and accurate
- [ ] **Test**: "Share token expired" → Clear and accurate
- [ ] **Test**: "Share token has reached its usage limit" → Clear and accurate
- [ ] **Test**: "Access denied" → Clear and accurate
- [ ] **Test**: "Unauthorized" → Clear and accurate
- [ ] **Test**: "Select a valid expiration date" → Clear and accurate
- [ ] **Test**: "Enter a valid max uses value" → Clear and accurate
- [ ] **Test**: "Failed to generate share link" → Clear and accurate
- [ ] **Test**: "Failed to revoke share link" → Clear and accurate
- [ ] **Test**: "Failed to load share links" → Clear and accurate

**Developer-Facing Errors:**
- [ ] **Test**: Database connection errors → Logged appropriately
- [ ] **Test**: Constraint violations → Logged appropriately
- [ ] **Test**: Unexpected exceptions → Logged with stack traces

---

## 6. Integration Testing

### 6.1 End-to-End Flows

**Flow 1: Owner Shares Document with Viewer**
1. [ ] Owner creates document
2. [ ] Owner opens ShareModal
3. [ ] Owner selects "Viewer" permission
4. [ ] Owner selects "7 days" expiration
5. [ ] Owner selects "10 uses" max uses
6. [ ] Owner clicks "Generate link"
7. [ ] Owner copies generated link
8. [ ] Owner sends link to Viewer
9. [ ] Viewer (not logged in) opens link
10. [ ] Viewer is prompted to sign in/sign up
11. [ ] Viewer authenticates
12. [ ] Viewer can view document
13. [ ] Viewer cannot edit document
14. [ ] useCount increments to 1
15. [ ] Owner sees token in active list with "1 / 10"

**Flow 2: Owner Shares Document with Editor**
1. [ ] Owner creates document
2. [ ] Owner opens ShareModal
3. [ ] Owner selects "Editor" permission
4. [ ] Owner selects "Never" expiration
5. [ ] Owner selects "Unlimited" max uses
6. [ ] Owner clicks "Generate link"
7. [ ] Owner copies generated link
8. [ ] Owner sends link to Editor
9. [ ] Editor (already logged in) opens link
10. [ ] Editor can view document
11. [ ] Editor can edit document
12. [ ] useCount increments to 1
13. [ ] Owner sees token in active list with "1 / unlimited"

**Flow 3: Multiple Users Access via Same Token**
1. [ ] Owner generates token with "5 uses" max
2. [ ] User 1 accesses via token → useCount = 1
3. [ ] User 2 accesses via token → useCount = 2
4. [ ] User 3 accesses via token → useCount = 3
5. [ ] User 4 accesses via token → useCount = 4
6. [ ] User 5 accesses via token → useCount = 5
7. [ ] User 6 attempts to access → Rejected (max uses reached)

**Flow 4: Token Expiration**
1. [ ] Owner generates token with short expiration (e.g., 1 minute)
2. [ ] User accesses immediately → Success
3. [ ] Wait for expiration time
4. [ ] Another user attempts to access → Rejected (expired)
5. [ ] Token no longer appears in active list

**Flow 5: Revoke Share Token**
1. [ ] Owner generates token
2. [ ] Multiple users access successfully
3. [ ] Owner clicks "Revoke link"
4. [ ] Token disappears from active list
5. [ ] Subsequent access attempts fail
6. [ ] Token removed from database

**Flow 6: Refresh Active Tokens List**
1. [ ] Owner has multiple active tokens
2. [ ] Another user uses one token
3. [ ] Owner clicks "Refresh"
4. [ ] Updated useCount displayed
5. [ ] All active tokens listed

**Flow 7: Generate Multiple Tokens**
1. [ ] Owner generates token A (Viewer, 7 days, 10 uses)
2. [ ] Owner generates token B (Editor, 30 days, unlimited)
3. [ ] Owner generates token C (Viewer, never, 50 uses)
4. [ ] All three tokens appear in active list
5. [ ] Tokens ordered by creation date (newest first)
6. [ ] Each token has correct settings displayed
7. [ ] Each token can be copied independently
8. [ ] Each token can be revoked independently

**Flow 8: Custom Expiration Date**
1. [ ] Owner opens ShareModal
2. [ ] Owner selects "Custom" expiration
3. [ ] Owner selects date 30 days from now
4. [ ] Owner generates token
5. [ ] Token created with correct expiration date
6. [ ] Token valid until specified date
7. [ ] Token expires on specified date

**Flow 9: Custom Max Uses**
1. [ ] Owner opens ShareModal
2. [ ] Owner selects "Custom" max uses
3. [ ] Owner enters "25"
4. [ ] Owner generates token
5. [ ] Token created with maxUses = 25
6. [ ] 25 uses allowed
7. [ ] 26th attempt rejected

**Flow 10: Error Recovery - Invalid Custom Date**
1. [ ] Owner selects "Custom" expiration
2. [ ] Owner enters invalid date (e.g., past date or invalid format)
3. [ ] Owner clicks "Generate link"
4. [ ] Error message displayed: "Select a valid expiration date"
5. [ ] No token generated
6. [ ] Owner corrects date
7. [ ] Owner clicks "Generate link" again
8. [ ] Token generated successfully

**Flow 11: Error Recovery - Invalid Custom Max Uses**
1. [ ] Owner selects "Custom" max uses
2. [ ] Owner enters "0" or negative number
3. [ ] Owner clicks "Generate link"
4. [ ] Error message displayed: "Enter a valid max uses value"
5. [ ] No token generated
6. [ ] Owner corrects value
7. [ ] Owner clicks "Generate link" again
8. [ ] Token generated successfully

### 6.2 Cross-Component Integration

**Document + Share Integration:**
- [ ] Test: Document deleted → Associated share tokens should be cleaned up (if implemented)
- [ ] Test: Document moved to trash → Share tokens still accessible
- [ ] Test: Document restored from trash → Share tokens still accessible

**WebSocket + Share Integration:**
- [ ] Test: User joins via share token → Presence system shows them
- [ ] Test: Multiple users via share token → All shown in presence
- [ ] Test: Editor token user makes changes → Real-time sync to others
- [ ] Test: Viewer token user sees changes in real-time

**Authentication + Share Integration:**
- [ ] Test: Unauthenticated user accesses share link → Redirected to auth
- [ ] Test: After auth, redirected back to document with share token
- [ ] Test: User auto-joined to document_members
- [ ] Test: User can access document after first share link access

**Permissions + Share Integration:**
- [ ] Test: Owner's role never downgraded by share token
- [ ] Test: Editor upgraded to owner → Can still use previously created share tokens
- [ ] Test: Viewer upgraded to editor → Can now create share tokens

### 6.3 State Management Integration

**Store State:**
- [ ] Test: ShareModal state doesn't affect global document state
- [ ] Test: Generated tokens don't persist across document switches
- [ ] Test: Active tokens list refreshes when reopening modal

**URL Parameters:**
- [ ] Test: Share link includes correct parameters (share, collab, token, workspaceId)
- [ ] Test: Share link is properly URL-encoded
- [ ] Test: Document ID properly encoded in URL
- [ ] Test: Workspace ID properly encoded in URL

---

## 7. Security Testing

### 7.1 Authentication & Authorization

**Token Security:**
- [ ] **Test**: Share tokens are cryptographically secure (UUID v4)
- [ ] **Test**: Tokens cannot be guessed
- [ ] **Test**: Tokens are unique per generation
- [ ] **Test**: Token generation rate limiting (if implemented)

**Access Control:**
- [ ] **Test**: Users cannot generate tokens for documents they don't have edit access to
- [ ] **Test**: Users cannot revoke tokens they don't have edit access to
- [ ] **Test**: Users cannot list tokens for documents they don't have edit access to
- [ ] **Test**: Owner cannot downgrade their own role via share token
- [ ] **Test**: Editor cannot upgrade themselves to owner via share token

### 7.2 Input Validation

**SQL Injection Prevention:**
- [ ] **Test**: SQL injection in token parameter → Should be sanitized
- [ ] **Test**: SQL injection in documentId → Should be sanitized
- [ ] **Test**: SQL injection in workspaceId → Should be sanitized
- [ ] **Test**: SQL injection in permission level → Should be sanitized

**XSS Prevention:**
- [ ] **Test**: XSS in share link → Should be escaped when displayed
- [ ] **Test**: XSS in custom expiration → Should be validated
- [ ] **Test**: XSS in custom max uses → Should be validated

**CSRF Protection:**
- [ ] **Test**: CSRF tokens included in state-changing requests
- [ ] **Test**: CSRF validation for POST /:id/share
- [ ] **Test**: CSRF validation for DELETE /share/:token

### 7.3 Data Privacy

**Token Exposure:**
- [ ] **Test**: Tokens not logged in error messages
- [ ] **Test**: Tokens not exposed in URLs after access (except share link itself)
- [ ] **Test**: Tokens not stored in local storage unnecessarily
- [ ] **Test**: Tokens not exposed in browser console logs

**User Privacy:**
- [ ] **Test**: User IDs not exposed in share links
- [ ] **Test**: Email addresses not exposed in share links
- [ ] **Test**: Only document ID and token in share link

### 7.4 Rate Limiting

**Token Generation:**
- [ ] **Test**: Rate limit on token generation per document (if implemented)
- [ ] **Test**: Rate limit on token generation per user (if implemented)

**Token Validation:**
- [ ] **Test**: Rate limit on token validation (if implemented)
- [ ] **Test**: Prevent token enumeration brute force

---

## 8. Performance Testing

### 8.1 Response Time

**Token Generation:**
- [ ] **Test**: Token generation < 500ms (normal load)
- [ ] **Test**: Token generation < 1s (high load)

**Token Validation:**
- [ ] **Test**: Token validation < 200ms (normal load)
- [ ] **Test**: Token validation < 500ms (high load)

**Token Listing:**
- [ ] **Test**: List 10 tokens < 200ms
- [ ] **Test**: List 100 tokens < 500ms

**Token Revocation:**
- [ ] **Test**: Revoke token < 200ms

### 8.2 Concurrency

**Simultaneous Access:**
- [ ] **Test**: 100 concurrent users validate same token → All handled correctly
- [ ] **Test**: 10 concurrent token generations → All succeed
- [ ] **Test**: Concurrent useCount increments → Final count correct

**Database Performance:**
- [ ] **Test**: Query performance with many share tokens in database
- [ ] **Test**: Index on token column (if applicable)
- [ ] **Test**: Index on document_id column (if applicable)

### 8.3 Scalability

**Large Datasets:**
- [ ] **Test**: Document with 1000 share tokens → List performs well
- [ ] **Test**: Token used 1000 times → Validation performs well
- [ ] **Test**: Many expired tokens → Query filters correctly

**Memory Usage:**
- [ ] **Test**: Memory usage doesn't grow unbounded
- [ ] **Test**: No memory leaks in token management

---

## 9. Automated Testing Recommendations

### 9.1 Unit Tests

**Service Layer:**
- [ ] test: generateShareToken with all parameter combinations
- [ ] test: validateShareToken with all validation scenarios
- [ ] test: incrementTokenUsage with boundary conditions
- [ ] test: mapShareTokenRow with various data formats
- [ ] test: revokeShareToken success and failure cases
- [ ] test: listActiveShareTokens filtering logic

**Helper Functions:**
- [ ] test: parseTimestamp with various inputs
- [ ] test: parseNumber with various inputs

### 9.2 Integration Tests

**API Endpoints:**
- [ ] test: POST /:id/share with valid and invalid inputs
- [ ] test: GET /:id/share-tokens with various auth/authorization scenarios
- [ ] test: DELETE /share/:token with various auth/authorization scenarios
- [ ] test: GET /share/:token validation logic

**Database Operations:**
- [ ] test: Token generation, validation, and revocation flow
- [ ] test: Auto-join functionality
- [ ] test: Permission enforcement

### 9.3 End-to-End Tests

**User Flows:**
- [ ] test: Share document flow (generate, copy, access)
- [ ] test: Revoke token flow
- [ ] test: Multiple token generation
- [ ] test: Token expiration behavior
- [ ] test: Max uses limit behavior

**UI Interactions:**
- [ ] test: ShareModal open/close
- [ ] test: Permission selection
- [ ] test: Expiration selection (including custom)
- [ ] test: Max uses selection (including custom)
- [ ] test: Generate link with valid inputs
- [ ] test: Generate link with invalid inputs
- [ ] test: Copy link functionality
- [ ] test: Refresh tokens list
- [ ] test: Revoke token
- [ ] test: Responsive design

### 9.4 Performance Tests

**Load Testing:**
- [ ] test: 1000 token generations
- [ ] test: 10000 token validations
- [ ] test: Concurrent token access

**Stress Testing:**
- [ ] test: System under heavy load
- [ ] test: Database under heavy load

---

## 10. Testing Environment Setup

### 10.1 Required Test Data

**Users:**
- Owner user account
- Editor user account
- Viewer user account
- Non-member user account

**Documents:**
- Document owned by Owner
- Document with multiple members

**Share Tokens:**
- Active viewer token
- Active editor token
- Expired token
- Token at max uses limit
- Token with null expiration
- Token with null max uses

### 10.2 Test Configurations

**Browser Testing:**
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

**Screen Sizes:**
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

**Dark Mode:**
- [ ] Light mode
- [ ] Dark mode

---

## 11. Test Execution Tracking

### 11.1 Test Results Log

| Test ID | Test Name | Result | Notes | Tester | Date |
|---------|-----------|--------|-------|--------|------|
| | | | | | |

### 11.2 Bug Tracking

| Bug ID | Test Case | Severity | Description | Status | Fixed By | Date |
|--------|-----------|----------|-------------|--------|----------|------|
| | | | | | | |

---

## 12. Sign-Off

**Testing Completed By:** _______________________ **Date:** _____________

**QA Review:** _______________________ **Date:** _____________

**Product Owner Approval:** _______________________ **Date:** _____________

---

## Notes

- All tests should be documented with steps, expected results, and actual results
- Automated tests should be integrated into CI/CD pipeline
- Manual tests should be performed before each release
- Performance tests should be run regularly
- Security tests should be performed after any changes to auth/authorization