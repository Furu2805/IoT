# Import Postman collection

1. In Postman, select Import and choose IoT-Dashboard-API.postman_collection.json.
2. Open the imported IoT Dashboard API collection.
3. Set the `adminUsername` and `adminPassword` collection variables to match `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `backend/.env`.
4. Send Auth → Đăng nhập once. The post-response script stores the returned token in the collection variable `token`.
5. Send any other request. Requests inherit Bearer `{{token}}` from the collection. The control request is preset to turn off led2; set status to true to turn it on.

The collection uses baseUrl = http://localhost:4000/api. Change it in the collection Variables tab if the backend runs at another address.

Login returns a signed JWT that expires after one hour. All API routes except login require a valid Bearer token.

The backend loads its credentials and service settings from `backend/.env`. To set up another copy, copy `backend/.env.example` to `backend/.env`, then replace the example admin, MQTT, and JWT values with your own. Keep TLS verification enabled unless you explicitly trust a self-signed broker certificate. See the project `README.md` for setup instructions.
