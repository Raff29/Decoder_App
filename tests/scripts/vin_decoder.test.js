const path = require('path');
const fs = require('fs');

describe('vin_decoder.js constants', () => {
  it('should have DELAY_BETWEEN_BATCHES set to 500 ms', () => {
    const filePath = path.resolve(__dirname, '../../scripts/vin_decoder.js');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const match = fileContent.match(/const DELAY_BETWEEN_BATCHES = (\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(500);
  });
});