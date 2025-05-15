import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom';
import Home from '../app/page'

jest.mock('@/components/StopProcessButton', () => ({ StopProcessButton: () => <button>Stop Process</button> }))
jest.mock('@/lib/validation', () => ({ validateFile: jest.fn().mockResolvedValue({ isValid: true }) }))

describe('Home page', () => {
  it('renders upload UI', () => {
    render(<Home />)
    expect(screen.getByText(/VIN Decoder/i)).toBeInTheDocument()
    expect(screen.getByText(/Click to upload Excel file/i)).toBeInTheDocument()
  })

  it('validates and sets file', async () => {
    render(<Home />)
    // Find the file input by querySelector since it has no label or role
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    if (input) {
      const fileObj = new window.File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      fireEvent.change(input, { target: { files: [fileObj] } });
    }
    await waitFor(() => expect(screen.getByText(/Process VINs/i)).toBeInTheDocument())
  })
})