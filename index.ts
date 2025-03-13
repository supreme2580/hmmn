import express from 'express';
import dotenv from 'dotenv';
import { Account, AccountInterface, constants, Contract, RpcProvider } from 'starknet';

dotenv.config();

const app = express();
const port = 3000;
const contract_address = process.env.CONTRACT_ADDRESS || "";
const private_key = process.env.PRIVATE_KEY || "";
const public_key = process.env.PUBLIC_KEY || "";
const provider = new RpcProvider({
    nodeUrl: constants.NetworkName.SN_MAIN,
});
const { abi } = await provider.getClassAt(contract_address);
const contract = new Contract(abi, contract_address, provider);
const account = new Account(provider, public_key, private_key, undefined, constants.TRANSACTION_VERSION.V3);
contract.connect(account as AccountInterface);

let intervalId: NodeJS.Timeout | null = null;
let stencilPixelData: any = null;

async function getStencilPixelData(hash: string): Promise<any> {
    const endpoint = `https://api.art-peace.net//get-stencil-pixel-data?hash=${encodeURIComponent(hash)}`;
  
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
  
      const text = await response.text();
  
      if (!response.ok) {
        throw new Error(`Error fetching stencil pixel data: ${response.statusText}`);
      }
  
      const data = JSON.parse(text); // Parse the text as JSON
      return data;
    } catch (error) {
      console.error('Failed to fetch stencil pixel data:', error);
      throw error;
    }
}

function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


function hexToRgb(hex: string): [number, number, number] {
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
}

function calculateDistance(color1: [number, number, number], color2: [number, number, number]): number {
    return Math.sqrt(
        Math.pow(color1[0] - color2[0], 2) +
        Math.pow(color1[1] - color2[1], 2) +
        Math.pow(color1[2] - color2[2], 2)
    );
}

const positions = Array.from({ length: 5 }, () => {
    const x = getRandomInt(0, 256);
    const y = getRandomInt(0, 192);
    return x + y * 256; // Convert the x, y position to a single value
});

function findClosestColorIndex(targetColor: [number, number, number], palette: [number, number, number][]): number {
    let closestIndex = 0;
    let minDistance = Infinity;

    palette.forEach((color, index) => {
        const distance = calculateDistance(targetColor, color);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = index + 1; // Assuming indices start from 1
        }
    });

    return closestIndex;
}

// ... existing code ...

async function contractCall(canvas_id: number, positions: number[], colors: string[]) {
    try {
        const now = (await provider.getBlock()).timestamp;
        const rgbColors = colors.slice(0, 5).map(hexToRgb); // Convert hex colors to RGB

        const pixelColors = rgbColors.map(targetColor => {
            return findClosestColorIndex(targetColor, rgbColors); // Use rgbColors as the palette
        });

        const contract_call = contract.populate("place_pixels", [
            canvas_id,
            positions,
            pixelColors,
            now
        ]);

        const res = await contract.place_pixels(contract_call.calldata);

        console.log({
            res
        });

    } catch (error) {
        // console.error('An error occurred during contract call:', error);
        // Continue execution even if an error occurs
    }
}

// Function to start the interval
function startContractCallInterval(canvas_id: number, positions: number[], colors: string[]) {
    intervalId = setInterval(async () => {
        await contractCall(canvas_id, positions, colors);
    }, 5000); // 5 seconds interval
}

// Endpoint to start logging
app.get('/start', async (req, res) => {
    if (!intervalId) {
        if (stencilPixelData === null) {
            try {
                stencilPixelData = await getStencilPixelData("00f6cbdf6ab734bde0025b4ccada5888ec04bcbad0d6898fe252d5d7c5ca13b6");
            } catch (error) {
                console.log('Failed to fetch stencil pixel data.');
            }
        }
        const canvas_id = process.env.CANVAS_ID;
        const totalPixels = stencilPixelData?.data?.width * stencilPixelData?.data?.height || 0;
        const defaultColor = [255, 255, 255, 255]; // Fallback color (white with full opacity)

        const pixelColors = Array.from({ length: 5 }, () => {
            if (totalPixels > 0) {
                const pixelIndex = getRandomInt(0, totalPixels - 1);
                const colorStartIndex = pixelIndex * 4;
                if (colorStartIndex + 4 <= stencilPixelData.data.pixelData.length) {
                    return stencilPixelData.data.pixelData.slice(colorStartIndex, colorStartIndex + 4);
                }
            }
            return defaultColor; // Use fallback color if out of bounds or no data
        }).flat();

        startContractCallInterval(canvas_id, positions, pixelColors);
        res.send('Started logging every five seconds.');
    } else {
        res.send('Already logging.');
    }
});

// Endpoint to stop logging
app.get('/stop', (req, res) => {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        res.send('Stopped logging.');
    } else {
        res.send('Logging is not active.');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});