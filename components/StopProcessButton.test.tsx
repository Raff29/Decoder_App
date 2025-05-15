import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StopProcessButton } from './StopProcessButton'

describe('StopProcessButton', () => {
  it('renders and calls onStopped on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any
    const onStopped = jest.fn()
    render(<StopProcessButton jobId="abc-123" onStopped={onStopped} />)
    fireEvent.click(screen.getByText(/Stop Process/i))
    await waitFor(() => expect(onStopped).toHaveBeenCalled())
  })

  it('shows error on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Failed' }) }) as any
    render(<StopProcessButton jobId="abc-123" />)
    fireEvent.click(screen.getByText(/Stop Process/i))
    await waitFor(() => expect(screen.getByText(/Failed/)).toBeInTheDocument())
  })
})
