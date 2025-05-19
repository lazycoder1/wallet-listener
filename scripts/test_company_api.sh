#!/bin/bash

# Script to test the Company API endpoints

BASE_URL="http://localhost:3001"
COMPANY_NAME="TestCo-$(date +%s)" # Unique name using timestamp
UPDATED_COMPANY_NAME="UpdatedCo-$(date +%s)"

HR='==================================================================='

echo "$HR"
echo "🧪 Starting Company API Test Script"
echo "$HR"

# 1. POST - Create a new company
echo "\n▶️ 1. Creating a new company: $COMPANY_NAME"
CREATE_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$COMPANY_NAME\"}" \
  $BASE_URL/companies)

COMPANY_ID=$(echo $CREATE_RESPONSE | bun -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).id)")

echo "📄 Response: $CREATE_RESPONSE"
if [ -z "$COMPANY_ID" ] || [ "$COMPANY_ID" == "null" ]; then
  echo "❌ ERROR: Failed to create company or extract ID. Exiting."
  exit 1
fi
echo "✅ Company created with ID: $COMPANY_ID"

# 2. GET - List all companies
echo "\n$HR"
echo "▶️ 2. Listing all companies..."
curl -s -X GET $BASE_URL/companies | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0, 'utf-8')), null, 2))"
echo "\n✅ Listed all companies."

# 3. GET - Get the specific company by ID
echo "\n$HR"
echo "▶️ 3. Getting company by ID: $COMPANY_ID"
curl -s -X GET $BASE_URL/companies/$COMPANY_ID | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0, 'utf-8')), null, 2))"
echo "\n✅ Got company $COMPANY_ID."

# 4. PUT - Update the company
echo "\n$HR"
echo "▶️ 4. Updating company ID $COMPANY_ID with name: $UPDATED_COMPANY_NAME"
UPDATE_RESPONSE=$(curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$UPDATED_COMPANY_NAME\"}" \
  $BASE_URL/companies/$COMPANY_ID)
echo "📄 Response: $UPDATE_RESPONSE"
echo "\n✅ Updated company $COMPANY_ID."

# 5. GET - Get the company again to verify update
echo "\n$HR"
echo "▶️ 5. Getting company by ID $COMPANY_ID again to verify update..."
curl -s -X GET $BASE_URL/companies/$COMPANY_ID | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0, 'utf-8')), null, 2))"
echo "\n✅ Verified update for company $COMPANY_ID."

# 6. DELETE - Delete the company
echo "\n$HR"
echo "▶️ 6. Deleting company ID: $COMPANY_ID"
DELETE_RESPONSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE $BASE_URL/companies/$COMPANY_ID)
echo "📄 Response Code: $DELETE_RESPONSE_CODE"
if [ "$DELETE_RESPONSE_CODE" -eq 204 ]; then
  echo "✅ Company $COMPANY_ID deleted successfully (HTTP 204)."
else
  echo "❌ ERROR: Failed to delete company $COMPANY_ID. HTTP Code: $DELETE_RESPONSE_CODE"
fi

# 7. GET - List all companies again
echo "\n$HR"
echo "▶️ 7. Listing all companies again to verify deletion..."
curl -s -X GET $BASE_URL/companies | bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0, 'utf-8')), null, 2))"
echo "\n✅ Verified company list after deletion."

# 8. GET - Attempt to get the deleted company by ID (should be 404)
echo "\n$HR"
echo "▶️ 8. Attempting to get deleted company by ID: $COMPANY_ID (expecting 404)"
GET_DELETED_RESPONSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET $BASE_URL/companies/$COMPANY_ID)
GET_DELETED_RESPONSE_BODY=$(curl -s -X GET $BASE_URL/companies/$COMPANY_ID)
echo "📄 Response Code: $GET_DELETED_RESPONSE_CODE"
echo "📄 Response Body: $GET_DELETED_RESPONSE_BODY"
if [ "$GET_DELETED_RESPONSE_CODE" -eq 404 ]; then
  echo "✅ Successfully received HTTP 404 for deleted company $COMPANY_ID."
else
  echo "❌ ERROR: Expected HTTP 404 but got $GET_DELETED_RESPONSE_CODE for deleted company $COMPANY_ID."
fi

echo "\n$HR"
echo "🏁 Company API Test Script Finished"
echo "$HR" 