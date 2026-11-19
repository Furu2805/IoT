# IoT Dashboard

Full-stack IoT dashboard with a React/Vite frontend, Express API, Socket.IO, MySQL, MQTT, and an ESP32 firmware sample.

## Run locally

1. Install the backend and frontend dependencies with `npm ci` in each folder.
2. Copy `backend/.env.example` to `backend/.env` and set the JWT, admin, database, and MQTT values for your environment.
3. Initialize the `smart_room` database schema and apply the SQL migrations in `backend/migrations` in order.
4. Run `npm start` from `backend`. It builds the frontend and starts the server on port 4000 by default.

For frontend development, start the backend, then run `npm run dev` from `frontend`. Vite proxies API and Socket.IO traffic to `http://localhost:4000`.

The Postman collection is in `postman/`. Set its `adminUsername` and `adminPassword` variables to the values in `backend/.env` before sending the login request.

## ESP32 firmware

Copy `secrets.example.h` to `secrets.h`, fill in your Wi-Fi and MQTT settings, then place both files beside the firmware sketch in Arduino IDE. `secrets.h` is ignored by Git.

Never commit `.env` files or `secrets.h`.
