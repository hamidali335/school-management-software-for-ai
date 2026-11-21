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
  private static isMocked: boolean = false;

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

    // Collect unique network interface MACs if available
    const netInterfaces = os.networkInterfaces();
    const macSet = new Set<string>();
    for (const name of Object.keys(netInterfaces)) {
      const list = netInterfaces[name];
      if (list) {
        for (const iface of list) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macSet.add(iface.mac.toLowerCase());
          }
        }
      }
    }
    const macSignature = Array.from(macSet).sort().join(',');

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
   * Verifies whether a candidate hardware fingerprint belongs to this workstation.
   * Tolerates dynamic network state changes (e.g. offline status with empty MACs or
   * legacy un-deduplicated IPv4/IPv6 address lists) while strictly preventing foreign hardware.
   */
  public static matches(candidate: string, installationId?: string): boolean {
    if (!candidate || typeof candidate !== 'string') {
      return false;
    }
    if (this.isMocked) {
      return candidate === this.cachedFingerprint;
    }
    const current = this.getFingerprint(installationId);
    if (candidate === current) {
      return true;
    }

    const cpus = os.cpus() || [];
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'standard_cpu';
    const cpuCores = cpus.length;
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    const installKey = installationId || 'inst_default_key';

    const netInterfaces = os.networkInterfaces();
    const macList: string[] = [];
    const macSet = new Set<string>();
    for (const name of Object.keys(netInterfaces)) {
      const list = netInterfaces[name];
      if (list) {
        for (const iface of list) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            const m = iface.mac.toLowerCase();
            macList.push(m);
            macSet.add(m);
          }
        }
      }
    }

    const candidateSignatures = new Set<string>();
    // 1. Deduplicated MACs
    candidateSignatures.add(Array.from(macSet).sort().join(','));
    // 2. Un-deduplicated raw list as returned by os.networkInterfaces()
    candidateSignatures.add(macList.sort().join(','));
    // 3. Common address-multiplicity variations (1 to 6 duplicates of active MACs)
    for (const m of Array.from(macSet)) {
      for (let count = 1; count <= 6; count++) {
        candidateSignatures.add(Array(count).fill(m).join(','));
      }
    }
    // 4. Empty MAC (when completely offline / no interfaces)
    candidateSignatures.add('');

    for (const sig of Array.from(candidateSignatures)) {
      const raw = [
        platform,
        arch,
        hostname,
        cpuModel,
        cpuCores,
        totalMem,
        sig,
        installKey,
      ].join('||');
      const hash = `fp_win_${crypto.createHash('sha256').update(raw, 'utf8').digest('hex').substring(0, 32)}`;
      if (candidate === hash) {
        return true;
      }
    }

    return false;
  }

  /**
   * For testing: allows overriding or resetting fingerprint
   */
  public static setMockFingerprint(mockFp: string | null) {
    this.cachedFingerprint = mockFp;
    this.isMocked = mockFp !== null;
  }
}
