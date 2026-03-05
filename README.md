# Carrier Shipment Emailer

A Chrome extension that streamlines communication with carriers by automatically generating professional shipment detail emails from Turvo shipment data.

## Features

- **Automatic Data Extraction**: Captures shipment details directly from Turvo shipment pages
- **Smart Formatting**: 
  - Chronologically sorted pickup and delivery locations
  - Time windows for FCFS appointments (e.g., "Nov 12 (09:00 - 17:00)")
  - Single appointment times for scheduled appointments
  - Timezone-aware date/time formatting
- **Customizable Email Generation**: Select which details to include in your email
- **Professional Email Format**: Clean, structured output ready to send to carriers
- **One-Click Copy**: Copy formatted email to clipboard with a single click
- **Data Export**: Download raw shipment data as JSON for record-keeping

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/Carrier-Shipment-Emailer-main.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the extension directory

5. The extension icon should appear in your Chrome toolbar

## Usage

### Basic Workflow

1. **Navigate to a Turvo shipment page**
   - Open any shipment detail page on `app.turvo.com`
   - The extension automatically captures the bearer token

2. **Open the extension**
   - Click the extension icon in your Chrome toolbar
   - The extension automatically fetches and displays shipment details

3. **Review shipment information**
   - Locations (pickup/delivery) with dates and appointment types
   - Commodity details
   - Weight and temperature requirements
   - Special services
   - Rate information

4. **Generate email**
   - Check/uncheck the details you want to include
   - Click "Generate Email" or "Copy Email"
   - Paste into your email client

### Email Format

The generated email follows this professional structure:

```
Shipment details can be found below.

Ship Locations:
Pickup: Chicago, IL | Nov 12 (09:00 - 17:00) | (FCFS)
Delivery: Detroit, MI | Nov 13 (14:00) | (appt)

Commodity: Fresh Produce
Weight: 45000 lbs
Temperature: 35 F
Services: Refrigerated, Lift Gate
Rate: 2500
```

### Advanced Features

**Developer Mode**
- Toggle developer mode to access additional features:
  - View current page URL and validation status
  - See captured bearer token
  - Download raw JSON data
  - Download shipment lists by custom ID

**Refresh Data**
- Click the refresh button to fetch the latest shipment data
- Shift+Click the refresh button to force reload the entire page

## Data Fields

The extension extracts and formats the following information:

| Field | Source | Notes |
|-------|--------|-------|
| Locations | `global_route.ship_locations` | Sorted chronologically |
| Appointment Times | `appointment.date` + `appointment.flex` | Flex shown for FCFS only |
| Appointment Type | `schedulingType` | Displays as (FCFS) or (appt) |
| Commodity | `customer_orders[].items[].name` | Comma-separated if multiple |
| Weight | `equipment[].attributes.weight` | With units (lbs/kg) |
| Temperature | `equipment[].attributes.temp` | With units (F/C) |
| Services | `services[].value` | Comma-separated list |
| Rate | `margin.minCarrierPay` | Carrier pay amount |

## Technical Details

### Files

- **`manifest.json`**: Extension configuration
- **`background.js`**: Service worker that captures bearer tokens and handles API requests
- **`popup.html`**: Extension popup UI
- **`popup.js`**: Main logic for data processing and email generation
- **`shipmentList.js`**: Shipment list fetching functionality

### API Integration

The extension integrates with the Turvo API:
- **Authentication**: Captures bearer tokens from outgoing requests to `app.turvo.com`
- **Endpoint**: `GET /api/shipments/{shipmentId}`
- **Query Types**: `general`, `permissions`, `groups`, `commissions`, `bids`, `topCarriers`
- **Caching**: Stores shipment data in session storage per tab for performance

### Permissions

The extension requires the following permissions:
- `webRequest` / `webRequestBlocking`: To capture authentication tokens
- `storage`: To cache shipment data and user preferences
- `tabs`: To detect active shipment pages
- Host permission for `https://app.turvo.com/*`

## Development

### Project Structure

```
Carrier-Shipment-Emailer-main/
├── manifest.json          # Extension manifest
├── background.js          # Service worker
├── popup.html            # Extension popup UI
├── popup.js              # Main application logic
├── shipmentList.js       # Shipment list functionality
├── hello.html            # Welcome page
└── hello_extensions.png  # Extension icon
```

### Key Features Implementation

**Chronological Sorting**
- Locations are sorted by `appointment.date` or `loc.date`
- Falls back gracefully for missing dates

**Time Window Display**
- FCFS appointments: Shows start and end times using `flex` field
- Single-day windows: `Nov 12 (09:00 - 17:00)`
- Multi-day windows: `Nov 12 (23:00) to Nov 13 (07:00)`
- Regular appointments: Shows only start time

**Timezone Handling**
- Extracts timezone from location data
- Uses IANA timezone identifiers
- Falls back to state-based timezone inference

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Add your license here]

## Support

For issues, questions, or suggestions, please [open an issue](https://github.com/yourusername/Carrier-Shipment-Emailer-main/issues) on GitHub.

## Changelog

### Recent Updates
- Added chronological sorting for locations
- Improved date/time formatting with timezone support
- Enhanced FCFS time window display
- Optimized email readability
- Added support for appointment flex times
- Changed services to display value field instead of key

---

**Note**: This extension is designed specifically for use with Turvo TMS. It requires an active Turvo session to function properly.

