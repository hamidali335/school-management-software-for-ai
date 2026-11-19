import crypto from 'node:crypto';
import os from 'node:os';

/**
 * Windows Device Fingerprinting & Binding
 * 
 * Generates a stable, non-invasive device fingerprint hash from platform,
 * architecture, CPU models, physical memory, and workstation identity.
 * 
 * Strict privacy guarantee:
 * Raw hardware serial numbers and personal identifiers are never stored or exposed in logs.
 * A one-way SHA-256 digest is produced and prefixed with 'fp_win_'.
 */
export class DeviceFingerprint {
  private static cachedFingerprint: string | null = null;

  public static getFingerprint(installationId?: string): string {
    if (this.cachedFingerprint) {
      return this.cachedFingerprint;
    }

    const cpus = os.cpus() || [];
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'standard_cpu';
    const cpuCores = cpus.length;
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024)); // rounded GB
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    const installKey = installationId || 'inst_default_key';

    // Collect network interface MACs if available
    const netInterfaces = os.networkInterfaces();
    const macs: string[] = [];
    for (const name of Object.keys(netInterfaces)) {
      const list = netInterfaces[name];
      if (list) {
        for (const iface of list) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macs.push(iface.mac.toLowerCase());
          }
        }
      }
    }
    const macSignature = macs.sort().join(',');

    const rawFingerprint = [
      platform,
      arch,
      hostname,
      cpuModel,
      cpuCores,
      totalMem,
      macSignature,
      installKey,
    ].join('||');

    const digest = crypto.createHash('sha256').update(rawFingerprint, 'utf8').digest('hex');
    this.cachedFingerprint = `fp_win_${digest.substring(0, 32)}`;
    return this.cachedFingerprint;
  }

  /**
   * For testing: allows overriding or resetting fingerprint
   */
  public static setMockFingerprint(mockFp: string | null) {
    this.cachedFingerprint = mockFp;
  }
}
