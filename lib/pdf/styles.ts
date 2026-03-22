import { StyleSheet } from '@react-pdf/renderer'

export const shared = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#1a1a1a',
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 56,
  },

  // ── Header ────────────────────────────────
  headerBox: {
    borderBottom: '2px solid #1a1a1a',
    marginBottom: 16,
    paddingBottom: 10,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 9,
    textAlign: 'center',
    color: '#555',
    marginTop: 2,
  },
  documentTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 4,
    letterSpacing: 1,
  },
  documentNumber: {
    fontSize: 10,
    textAlign: 'center',
    color: '#444',
  },

  // ── Section ───────────────────────────────
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#444',
    borderBottom: '0.5px solid #ccc',
    paddingBottom: 3,
    marginBottom: 7,
  },

  // ── Grid / rows ───────────────────────────
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  col2: {
    flex: 1,
    paddingRight: 8,
  },
  label: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  value: {
    fontSize: 9.5,
    color: '#1a1a1a',
  },

  // ── Value highlight ────────────────────────
  amountBox: {
    backgroundColor: '#f5f5f5',
    border: '0.5px solid #ccc',
    borderRadius: 3,
    padding: '6 10',
    marginTop: 6,
    marginBottom: 6,
  },
  amountLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    textTransform: 'uppercase',
  },
  amountValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginTop: 2,
  },
  amountWords: {
    fontSize: 8.5,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 1,
  },

  // ── Obligation list ───────────────────────
  obligacionRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  obligacionNum: {
    width: 18,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    paddingTop: 1,
  },
  obligacionBody: {
    flex: 1,
  },
  obligacionText: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  actividadRow: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 8,
  },
  actividadBullet: {
    width: 10,
    fontSize: 9,
    color: '#555',
  },
  actividadText: {
    flex: 1,
    fontSize: 9,
    color: '#333',
  },
  actividadCantidad: {
    width: 50,
    fontSize: 9,
    color: '#555',
    textAlign: 'right',
  },

  // ── Signatures ────────────────────────────
  signaturesRow: {
    flexDirection: 'row',
    marginTop: 40,
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '44%',
    alignItems: 'center',
  },
  signatureLine: {
    borderTop: '1px solid #1a1a1a',
    width: '100%',
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  signatureRole: {
    fontSize: 8.5,
    color: '#555',
    textAlign: 'center',
  },
  signatureCedula: {
    fontSize: 8,
    color: '#777',
    textAlign: 'center',
    marginTop: 1,
  },

  // ── Footer ────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 56,
    right: 56,
    borderTop: '0.5px solid #ccc',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: '#999',
  },
})
