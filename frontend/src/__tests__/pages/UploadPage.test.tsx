import { render, screen } from '@testing-library/react';
import UploadPage from '../../app/upload/page';

// Mock Papa.parse
jest.mock('papaparse', () => ({
  parse: jest.fn(),
}));

describe('UploadPage', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  it('should render upload form', () => {
    render(<UploadPage />);
    expect(screen.getByText('Upload Addresses to Backend')).toBeInTheDocument();
  });

  it('should show expected CSV columns help text', () => {
    render(<UploadPage />);
    expect(
      screen.getByText(
        /Expected CSV columns: address, chain_type, threshold \(optional\), account_name \(optional\), account_manager \(optional\)/
      )
    ).toBeInTheDocument();
  });
});
