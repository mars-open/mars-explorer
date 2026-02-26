# MARS Explorer

A web-based visualization tool for exploring positionpoint data on railway infrastructure. Built for maintenance applications, MARS Explorer provides an interactive map interface to visualize, filter, and analyze geospatial data.

Explore Positionpoints of Switzerland on https://mars-open.github.io/mars-explorer/. They have been created from [Swisstopo TLM3d](https://www.swisstopo.admin.ch/de/landschaftsmodell-swisstlm3d) open-data. To create Positionpoints for other topology data, contact us.

## Features

- 🗺️ **Interactive Map Visualization** - Built with MapLibre GL for smooth, high-performance rendering
- 🎨 **Layer Control** - Toggle visibility of different data layers
- 🏷️ **Tag-based Filtering** - Filter features by tags to focus on specific data categories
- 🎯 **Advanced Selection Tools** - Click selection and box selection for efficient data exploration (draw a box using `ctrl-left-mouse`)
- 📊 **Feature Details Panel** - View detailed properties of selected features
- 📦 **Efficient Data Formats** - Support FlatGeobuf and PMTiles for optimized data loading

## Technology Stack

- **React 19** - Modern UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **MapLibre GL** - Open-source map rendering engine
- **FlatGeobuf** - Cloud-optimized geospatial format
- **PMTiles** - Serverless map tile format

## Prerequisites

- Yarn package manager

## Getting Started

### Installation

```bash
yarn install
```

### Development

Start the development server:

```bash
yarn dev
```

The application will be available at `http://localhost:5173`

### Build

Build for production:

```bash
yarn build
```

Preview the production build:

```bash
yarn preview
```

### Linting

Run ESLint to check code quality:

```bash
yarn lint
```

## Data Preparation

Position point data should be prepared using the **mars-base** repository. The prepared data is expected in formats compatible with the application:

- FlatGeobuf (`.fgb`) files for vector data
- PMTiles (`.pmtiles`) for tiled map data

## Deployment

The application is automatically deployed to GitHub Pages when changes are pushed to the `main` branch. The deployment workflow:

1. Builds the application using Vite
2. Deploys to GitHub Pages
3. Makes the app available at `https://mars-open.github.io/mars-explorer/`

## License

MARS Explorer is distributed under the GNU General Public License version 3 or later. The full terms of the license can be found at https://www.gnu.org/licenses/gpl-3.0.en.html.

## Contributors

[![ELCA AG](../mars-base/.assets/elca.png)](https://www.elca.ch/data-platform-service)

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## Acknowledgments

Great work from Swisstopo TLM3D and OpenStreetMap for providing accurate track geometries!
