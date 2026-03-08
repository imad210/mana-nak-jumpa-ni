# 🗺️ Jom Jumpa Tengah-Tengah

> Fair meetup finder for Malaysians. No more "jauh lah bro" excuses. Find the perfect midpoint and lepak there! 🇲🇾

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-green?logo=leaflet)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![Midpoint Malaysia Demo](https://via.placeholder.com/800x400/0a0a0a/3b82f6?text=Midpoint+Malaysia+Demo)

## ✨ Features

- 🎯 **Fair Midpoint Calculation** - Find the perfect meeting spot from 2-10 locations
- 🗺️ **Interactive Map** - Beautiful dark-themed map with zoom & pan controls
- 🔍 **Smart Location Search** - Search any locality in Malaysia (cities, towns, kampungs)
- 📍 **Visual Connections** - Dashed lines showing distance from each location to midpoint
- 🌓 **Dark/Light Mode** - Automatic theme switching based on system preferences
- 📱 **Mobile Responsive** - Works perfectly on all devices
- ✨ **Glassmorphism UI** - Modern, premium design with smooth animations

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed on your machine
- npm, yarn, pnpm, or bun package manager

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/jom-jumpa-tengah-tengah.git
cd jom-jumpa-tengah-tengah
```

2. **Install dependencies**
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. **Run the development server**
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

4. **Open your browser**

Navigate to [http://localhost:3000](http://localhost:3000) to see the app in action!

## 📖 How to Use

1. **Search Location** - Type any Malaysian location in the search box (e.g., "Kuala Lumpur", "Penang", "Johor Bahru")
2. **Select from Results** - Click on a location from the dropdown to add it
3. **Add More Locations** - Repeat to add up to 10 different locations
4. **View Midpoint** - The system automatically calculates and displays the fair midpoint with visual lines
5. **Remove Locations** - Hover over any added location and click the ❌ to remove it

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| [Next.js 15](https://nextjs.org/) | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe development |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [Leaflet](https://leafletjs.com/) | Interactive map library |
| [React Leaflet](https://react-leaflet.js.org/) | React components for Leaflet |
| [Framer Motion](https://www.framer.com/motion/) | Smooth animations |
| [Lucide React](https://lucide.dev/) | Beautiful icons |
| [Nominatim API](https://nominatim.org/) | Free geocoding service |

## 📁 Project Structure

```
jom-jumpa-tengah-tengah/
├── src/
│   ├── app/
│   │   ├── globals.css      # Global styles & themes
│   │   ├── layout.tsx       # Root layout component
│   │   └── page.tsx         # Main page with UI logic
│   ├── components/
│   │   └── Map.tsx          # Interactive Leaflet map
│   └── lib/
│       └── utils.ts         # Geocoding & midpoint utilities
├── public/                  # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## 🎨 Key Features Explained

### 🗺️ Interactive Map
- Full-screen interactive map with CartoDB dark tiles
- Smooth zoom and pan controls
- Auto-adjusts viewport to fit all locations

### 📍 Smart Markers
- **Blue markers** for user-added locations
- **Gold marker** for the calculated midpoint
- Click any marker for location details

### 🎯 Midpoint Algorithm
- Uses simple geographic center calculation
- Averages latitude and longitude of all locations
- Updates in real-time as locations are added/removed

### ✨ Visual Lines
- Amber dashed lines connect each location to the midpoint
- Helps visualize the fairness of the meeting spot
- Updates dynamically with location changes

## 🔧 Configuration

### Customize Map Theme
Edit `src/components/Map.tsx`:
```typescript
// Change to light theme
url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"

// Or use standard OpenStreetMap
url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
```

### Adjust Color Scheme
Edit CSS variables in `src/app/globals.css`:
```css
:root {
  --primary: #3b82f6;      /* Primary color */
  --accent: #f59e0b;       /* Accent color */
}
```

### Change Max Locations
Edit in `src/app/page.tsx`:
```typescript
if (locations.length >= 10) return  // Change to your limit
```

## 🌐 Deployment

### Deploy to Vercel (Recommended)

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/jom-jumpa-tengah-tengah)

Or via CLI:
```bash
npm install -g vercel
vercel
```

### Manual Deployment

1. **Build the project**
```bash
npm run build
```

2. **Start production server**
```bash
npm start
```

For other deployment options, check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying).

## 🧪 Example Use Cases

### 1. Friends Meetup
- Friend A from Penang
- Friend B from Kuala Lumpur  
- Friend C from Johor Bahru
- **Result**: Midpoint somewhere in central Malaysia

### 2. Team Meeting
- 5 team members from different areas in Klang Valley
- **Result**: Fair central location for everyone

### 3. Family Gathering
- Relatives scattered across Malaysia
- **Result**: Equidistant meeting point

## 🐛 Troubleshooting

**Map not displaying?**
- Clear browser cache and refresh
- Check internet connection (map tiles load from CDN)
- Verify all dependencies installed: `npm install`

**Search not working?**
- Check internet connection (uses Nominatim API)
- Try more specific location names
- Add state name for small towns (e.g., "Baling, Kedah")

**Build errors?**
```bash
# Clean install
rm -rf node_modules .next
npm install
npm run dev
```

## 🤝 Contributing

Contributions are welcome! Here are some ideas for improvements:

- [ ] Add actual driving distance calculations
- [ ] Find nearby restaurants/cafes at midpoint
- [ ] Save and share midpoint URLs
- [ ] Export meeting details
- [ ] Multi-language support (BM/EN)
- [ ] Travel time estimates
- [ ] Advanced weighted midpoint (based on travel time)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Maps powered by [OpenStreetMap](https://www.openstreetmap.org/)
- Geocoding by [Nominatim API](https://nominatim.org/)
- Map markers from [Leaflet Color Markers](https://github.com/pointhi/leaflet-color-markers)
- Icons by [Lucide](https://lucide.dev/)

## 📧 Contact

Got questions or suggestions? Feel free to:
- Open an issue on GitHub
- Submit a pull request
- Star the repo if you find it useful! ⭐

---

**Built with ❤️ for Malaysian communities** 🇲🇾

*No more "jauh lah bro" excuses. Jom jumpa tengah-tengah!* 🎯