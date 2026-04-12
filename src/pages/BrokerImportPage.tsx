import React, { useState } from 'react';
import {
  Container,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Box,
  Card,
  CardContent,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Divider,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import {
  parseIbkrFlexXmlForJournal,
  parseIbkrDividendsCsv,
  parseXtbBrokerReport,
  calculateFileHash,
  checkFileAlreadyImported,
  createBrokerImportRecord,
  importTradesFromStatement,
  importDividendsFromStatement,
} from '../services/brokerDataService';
import { useAuth } from '../contexts/AuthContext';
import type { ParsedBrokerStatement } from '../types/brokerData';

const STEPS = ['Select Broker', 'Upload File', 'Review Data', 'Confirm Import', 'Complete'];

type BrokerType = 'IBKR' | 'XTB' | null;
type ImportStep = 0 | 1 | 2 | 3 | 4;

interface ImportProgress {
  step: ImportStep;
  brokerType: BrokerType;
  uploadedFile: File | null;
  parsedStatement: ParsedBrokerStatement | null;
  importInProgress: boolean;
  importResult: {
    created: number;
    skipped: number;
    outcomesCreated?: number;
    errors: string[];
  } | null;
  fileHash: string | null;
}

export default function BrokerImportPage() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [progress, setProgress] = useState<ImportProgress>({
    step: 0,
    brokerType: null,
    uploadedFile: null,
    parsedStatement: null,
    importInProgress: false,
    importResult: null,
    fileHash: null,
  });

  const [dragActive, setDragActive] = useState(false);
  const [parsingInProgress, setParsingInProgress] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);

  // Step 1: Select broker type
  const handleBrokerSelect = (broker: BrokerType) => {
    setProgress((prev) => ({
      ...prev,
      brokerType: broker,
    }));
  };

  const handleNextFromBrokerStep = () => {
    if (progress.brokerType) {
      setProgress((prev) => ({ ...prev, step: 1 as ImportStep }));
    }
  };

  // Step 2: Upload file
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelected(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (file: File) => {
    setParsingError(null);
    setParsingInProgress(true);

    try {
      const fileBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(fileBuffer);
      const buffer = uint8 as unknown as Buffer;
      const hash = await calculateFileHash(uint8);

      // Check for duplicate file
      const duplicateCheck = await checkFileAlreadyImported(hash);
      if (duplicateCheck.exists) {
        setParsingError(
          `This file was already imported on ${duplicateCheck.importedAt ? new Date(duplicateCheck.importedAt).toLocaleDateString() : 'a previous date'}. Re-importing the same statement is not allowed to prevent duplicate entries.`
        );
        setParsingInProgress(false);
        return;
      }

      let parsedStatement: ParsedBrokerStatement | null = null;

      // Parse based on broker type and file type
      if (progress.brokerType === 'IBKR') {
        if (file.name.endsWith('.xml')) {
          // Journal parser preserves every trade and reads openCloseIndicator
          // so we can distinguish buy / sell / short / cover. The legacy
          // tax-pipeline parser collapses opens away — wrong for journaling.
          parsedStatement = await parseIbkrFlexXmlForJournal(buffer, file.name);
        } else if (file.name.endsWith('.csv')) {
          parsedStatement = await parseIbkrDividendsCsv(buffer, file.name);
        } else {
          throw new Error('IBKR files must be XML (Flex Report) or CSV (Dividends)');
        }
      } else if (progress.brokerType === 'XTB') {
        if (file.name.endsWith('.pdf')) {
          parsedStatement = await parseXtbBrokerReport(buffer, file.name);
        } else {
          throw new Error('XTB files must be PDF');
        }
      }

      if (!parsedStatement?.success) {
        throw new Error(parsedStatement?.error || 'Failed to parse file');
      }

      setProgress((prev) => ({
        ...prev,
        uploadedFile: file,
        parsedStatement,
        fileHash: hash,
      }));

      setParsingInProgress(false);
      setProgress((prev) => ({ ...prev, step: 2 as ImportStep }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setParsingError(errorMsg);
      setParsingInProgress(false);
    }
  };

  // Step 3: Review data
  const handleNextFromReviewStep = () => {
    // TODO: Implement duplicate checking
    // For now, proceed to confirmation
    setProgress((prev) => ({ ...prev, step: 3 as ImportStep }));
  };

  // Step 4: Confirm and import
  const handleImport = async () => {
    if (!progress.parsedStatement || !progress.fileHash || !progress.uploadedFile || !user) return;

    setProgress((prev) => ({ ...prev, importInProgress: true }));

    try {
      // 1. Create broker_imports audit record
      const importId = await createBrokerImportRecord(
        user.id,
        progress.parsedStatement,
        progress.fileHash,
        progress.uploadedFile.name
      );

      // 2. Import trades
      const tradeResult = await importTradesFromStatement(
        progress.parsedStatement,
        user.id,
        importId
      );

      // 3. Import dividends (if any)
      let dividendCreated = 0;
      if (progress.parsedStatement.dividends.length > 0) {
        const divResult = await importDividendsFromStatement(
          progress.parsedStatement,
          user.id,
          importId
        );
        dividendCreated = divResult?.dividends?.createdCount ?? 0;
      }

      const allErrors = tradeResult.trades.errors.map(
        (e) => `${e.trade.symbol} (${e.trade.tradeDate}): ${e.reason}`
      );

      setProgress((prev) => ({
        ...prev,
        importResult: {
          created: tradeResult.trades.createdCount + dividendCreated,
          skipped: tradeResult.trades.skippedCount,
          errors: allErrors,
        },
        importInProgress: false,
        step: 4 as ImportStep,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Import failed';
      setProgress((prev) => ({
        ...prev,
        importResult: {
          created: 0,
          skipped: 0,
          errors: [errorMsg],
        },
        importInProgress: false,
        step: 4 as ImportStep,
      }));
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (progress.step) {
      case 0:
        return (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Which broker are you importing from?
            </Typography>
            <RadioGroup
              value={progress.brokerType || ''}
              onChange={(e) => handleBrokerSelect(e.target.value as BrokerType)}
            >
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <FormControlLabel
                    value="IBKR"
                    control={<Radio />}
                    label="Interactive Brokers (IBKR)"
                  />
                  <Typography variant="body2" color="textSecondary">
                    Supports: Flex XML Reports, Activity HTML, Dividends CSV
                  </Typography>
                </CardContent>
              </Card>

              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <FormControlLabel
                    value="XTB"
                    control={<Radio />}
                    label="XTB"
                  />
                  <Typography variant="body2" color="textSecondary">
                    Supports: Portfolio & Dividends PDF Reports
                  </Typography>
                </CardContent>
              </Card>
            </RadioGroup>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
              <Button disabled>Back</Button>
              <Button
                variant="contained"
                onClick={handleNextFromBrokerStep}
                disabled={!progress.brokerType}
              >
                Next
              </Button>
            </Box>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Upload {progress.brokerType} Statement
            </Typography>

            {progress.brokerType === 'IBKR' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Upload an IBKR Activity Flex Query XML (.xml). Configure the
                query under <em>Performance &amp; Reports → Flex Queries → Activity Flex Query</em>,
                enable the <strong>Trades</strong> section, and make sure
                <strong> openCloseIndicator</strong> is checked — that&apos;s
                what tells us whether each fill opens or closes a position
                (so we can distinguish buy / sell / short / cover correctly).
                Flex caps the period at 365 days, so for a 4-year history
                run the query 4 times shifted back by 365 days each.
              </Alert>
            )}

            {progress.brokerType === 'XTB' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Upload your XTB portfolio or dividends PDF report.
              </Alert>
            )}

            <Box
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              sx={{
                border: '2px dashed',
                borderColor: dragActive ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: dragActive ? 'action.hover' : 'background.default',
                transition: 'all 0.3s ease',
              }}
            >
              <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Drag and drop your file here</Typography>
              <Typography variant="body2" color="textSecondary">
                or
              </Typography>
              <Button variant="contained" component="label" sx={{ mt: 1 }}>
                Choose File
                <input
                  hidden
                  accept={progress.brokerType === 'IBKR' ? '.xml,.csv' : '.pdf'}
                  type="file"
                  onChange={handleFileInputChange}
                />
              </Button>
            </Box>

            {parsingInProgress && (
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <CircularProgress size={24} />
                <Typography>Parsing file...</Typography>
              </Box>
            )}

            {parsingError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {parsingError}
              </Alert>
            )}

            {progress.uploadedFile && !parsingInProgress && (
              <Alert severity="success" sx={{ mt: 2 }}>
                ✅ File uploaded: {progress.uploadedFile.name}
              </Alert>
            )}

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
              <Button onClick={() => setProgress((prev) => ({ ...prev, step: 0 as ImportStep }))}>
                Back
              </Button>
              <Button
                variant="contained"
                onClick={handleNextFromReviewStep}
                disabled={!progress.parsedStatement}
              >
                Next
              </Button>
            </Box>
          </Box>
        );

      case 2:
        return (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Review Parsed Data
            </Typography>

            {progress.parsedStatement && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Found {progress.parsedStatement.trades.length} trades and{' '}
                  {progress.parsedStatement.dividends.length} dividends
                </Alert>

                {progress.parsedStatement.trades.length > 0 && (() => {
                  const counts = progress.parsedStatement.trades.reduce(
                    (acc, t) => {
                      const k = t.resolvedActionType ?? (t.buySell === 'SELL' ? 'sell' : 'buy');
                      acc[k] = (acc[k] ?? 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>
                  );
                  const withIndicator = progress.parsedStatement.trades.filter(
                    (t) => t.openCloseIndicator
                  ).length;
                  const total = progress.parsedStatement.trades.length;
                  return (
                    <Alert
                      severity={withIndicator === total ? 'success' : 'warning'}
                      sx={{ mb: 2 }}
                    >
                      <Typography variant="body2" component="div">
                        <strong>Action breakdown:</strong>{' '}
                        {(['buy', 'sell', 'short', 'cover'] as const)
                          .map((k) => `${counts[k] ?? 0} ${k}`)
                          .join(' · ')}
                      </Typography>
                      <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                        {withIndicator === total
                          ? `All ${total} trades had openCloseIndicator — direct mapping used.`
                          : `${withIndicator}/${total} trades had openCloseIndicator. The rest were inferred from chronological position tracking — accuracy depends on the import covering each position from its first open.`}
                      </Typography>
                    </Alert>
                  );
                })()}

                {progress.parsedStatement.trades.length > 0 && (
                  <>
                    <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                      Trades (showing first 10):
                    </Typography>
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Symbol</TableCell>
                            <TableCell>Side</TableCell>
                            <TableCell>Action</TableCell>
                            <TableCell align="right">Qty</TableCell>
                            <TableCell align="right">Price</TableCell>
                            <TableCell align="right">P&L</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {progress.parsedStatement.trades.slice(0, 10).map((trade, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{trade.tradeDate}</TableCell>
                              <TableCell>{trade.symbol}</TableCell>
                              <TableCell>{trade.buySell}</TableCell>
                              <TableCell>
                                <strong>{trade.resolvedActionType ?? '—'}</strong>
                                {trade.openCloseIndicator ? '' : ' (inferred)'}
                              </TableCell>
                              <TableCell align="right">{trade.quantity?.toFixed(2)}</TableCell>
                              <TableCell align="right">
                                {trade.tradePrice?.toFixed(2)}
                              </TableCell>
                              <TableCell align="right">
                                {trade.nRealizedPnl.toFixed(2)} {trade.currency}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}

                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
                  <Button onClick={() => setProgress((prev) => ({ ...prev, step: 1 as ImportStep }))}>
                    Back
                  </Button>
                  <Button variant="contained" onClick={handleNextFromReviewStep}>
                    Proceed to Import
                  </Button>
                </Box>
              </>
            )}
          </Box>
        );

      case 3:
        return (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Confirm and Import
            </Typography>

            {progress.parsedStatement && (
              <>
                <Card sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Import Summary
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ mt: 2 }}>
                      <Typography>
                        <strong>Trades to import:</strong> {progress.parsedStatement.trades.length}
                      </Typography>
                      <Typography>
                        <strong>Dividends:</strong> {progress.parsedStatement.dividends.length}
                      </Typography>
                      <Typography>
                        <strong>Broker:</strong> {progress.parsedStatement.broker}
                      </Typography>
                      <Typography>
                        <strong>Statement Type:</strong> {progress.parsedStatement.statementType}
                      </Typography>
                      {progress.parsedStatement.rawStats?.dateRange && (
                        <Typography>
                          <strong>Date Range:</strong>{' '}
                          {progress.parsedStatement.rawStats.dateRange.start} to{' '}
                          {progress.parsedStatement.rawStats.dateRange.end}
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>

                <Alert severity="warning" sx={{ mb: 2 }}>
                  ⚠️ Duplicate trades will be skipped. Trades are matched by symbol, date, and quantity.
                </Alert>

                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
                  <Button onClick={() => setProgress((prev) => ({ ...prev, step: 2 as ImportStep }))}>
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleImport}
                    disabled={progress.importInProgress}
                  >
                    {progress.importInProgress ? (
                      <>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        Importing...
                      </>
                    ) : (
                      'Import Now'
                    )}
                  </Button>
                </Box>
              </>
            )}
          </Box>
        );

      case 4:
        return (
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            {progress.importResult?.errors.length === 0 ? (
              <>
                <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  Import Complete!
                </Typography>
                <Card sx={{ mt: 3, mb: 3 }}>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      Import Results
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ mt: 2 }}>
                      <Typography>
                        ✅ <strong>Created:</strong> {progress.importResult?.created || 0} entries
                      </Typography>
                      <Typography>
                        ⏭️ <strong>Skipped:</strong> {progress.importResult?.skipped || 0} duplicates
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                <Button variant="contained" onClick={() => setProgress({
                  step: 0,
                  brokerType: null,
                  uploadedFile: null,
                  parsedStatement: null,
                  importInProgress: false,
                  importResult: null,
                  fileHash: null,
                })}>
                  Import Another Statement
                </Button>
              </>
            ) : (
              <>
                <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  Import Failed
                </Typography>
                {progress.importResult?.errors.map((error, idx) => (
                  <Alert key={idx} severity="error" sx={{ mt: 2 }}>
                    {String(error)}
                  </Alert>
                ))}
              </>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>

      {/* On mobile: show only the active step label + a small "Step X of N"
          counter (full 4-step horizontal row doesn't fit in 375px). On sm+:
          render the full horizontal stepper with alternativeLabel for tighter layout. */}
      {isMobile ? (
        <Box
          sx={{
            mb: 3,
            px: 1,
            py: 1.5,
            borderRadius: 1,
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            Step {Math.min(progress.step + 1, STEPS.length)} / {STEPS.length}
          </Typography>
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1, minWidth: 0 }} noWrap>
            {STEPS[progress.step]}
          </Typography>
        </Box>
      ) : (
        <Stepper activeStep={progress.step} alternativeLabel sx={{ mb: 4 }}>
          {STEPS.map((label, index) => (
            <Step key={label} completed={progress.step > index && index !== 4}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      <Paper sx={{ p: { xs: 1.5, sm: 3 } }}>
        {renderStepContent()}
      </Paper>
    </Container>
  );
}
