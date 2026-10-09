// Vérification déterministe des numéros de téléphone donnés au chatbot.
// Un modèle de langage compte mal les chiffres : c'est donc le serveur qui contrôle la longueur
// du numéro selon l'indicatif, et le résultat est transmis au modèle sous forme de note.

// Longueur du numéro national (après l'indicatif, sans le 0 de préfixe) par indicatif.
// zero : le 0 initial du format national est un préfixe à retirer (« +33 06… » reste accepté).
// Indicatif absent de la table : numéro « invérifiable », jamais bloqué pour autant.
const PAYS = {
  '33':  { nom: 'France', longueurs: [9], zero: true },
  '262': { nom: 'La Réunion / Mayotte', longueurs: [9], zero: true },
  '590': { nom: 'Guadeloupe', longueurs: [9], zero: true },
  '594': { nom: 'Guyane', longueurs: [9], zero: true },
  '596': { nom: 'Martinique', longueurs: [9], zero: true },
  '32':  { nom: 'Belgique', longueurs: [8, 9], zero: true },
  '41':  { nom: 'Suisse', longueurs: [9], zero: true },
  '377': { nom: 'Monaco', longueurs: [8, 9], zero: false },
  '44':  { nom: 'Royaume-Uni', longueurs: [9, 10], zero: true },
  '34':  { nom: 'Espagne', longueurs: [9], zero: false },
  '351': { nom: 'Portugal', longueurs: [9], zero: false },
  '1':   { nom: 'États-Unis / Canada', longueurs: [10], zero: false },
  '225': { nom: "Côte d'Ivoire", longueurs: [10], zero: false },
  '224': { nom: 'Guinée', longueurs: [9], zero: false },
  '221': { nom: 'Sénégal', longueurs: [9], zero: false },
  '223': { nom: 'Mali', longueurs: [8], zero: false },
  '226': { nom: 'Burkina Faso', longueurs: [8], zero: false },
  '227': { nom: 'Niger', longueurs: [8], zero: false },
  '228': { nom: 'Togo', longueurs: [8], zero: false },
  '229': { nom: 'Bénin', longueurs: [8, 10], zero: false },
  '237': { nom: 'Cameroun', longueurs: [9], zero: false },
  '241': { nom: 'Gabon', longueurs: [7, 8], zero: false },
  '242': { nom: 'Congo', longueurs: [9], zero: false },
  '243': { nom: 'RD Congo', longueurs: [9], zero: true },
  '235': { nom: 'Tchad', longueurs: [8], zero: false },
  '236': { nom: 'Centrafrique', longueurs: [8], zero: false },
  '240': { nom: 'Guinée équatoriale', longueurs: [9], zero: false },
  '222': { nom: 'Mauritanie', longueurs: [8], zero: false },
  '212': { nom: 'Maroc', longueurs: [9], zero: true },
  '213': { nom: 'Algérie', longueurs: [8, 9], zero: true },
  '216': { nom: 'Tunisie', longueurs: [8], zero: false },
  '20':  { nom: 'Égypte', longueurs: [8, 9, 10], zero: true },
  '261': { nom: 'Madagascar', longueurs: [9], zero: true },
  '250': { nom: 'Rwanda', longueurs: [9], zero: true },
  '257': { nom: 'Burundi', longueurs: [8], zero: false },
  '253': { nom: 'Djibouti', longueurs: [8], zero: false },
  '269': { nom: 'Comores', longueurs: [7], zero: false },
  '230': { nom: 'Maurice', longueurs: [7, 8], zero: false },
  '234': { nom: 'Nigeria', longueurs: [8, 10], zero: true },
  '233': { nom: 'Ghana', longueurs: [9], zero: true },
  '509': { nom: 'Haïti', longueurs: [8], zero: false },
  '961': { nom: 'Liban', longueurs: [7, 8], zero: true },
  '90':  { nom: 'Turquie', longueurs: [10], zero: true },
  '7':   { nom: 'Russie / Kazakhstan', longueurs: [10], zero: false },
  '86':  { nom: 'Chine', longueurs: [10, 11], zero: true },
  '91':  { nom: 'Inde', longueurs: [10], zero: true }
};

// Suite de chiffres et de séparateurs usuels, éventuellement précédée de + ou 00.
const CANDIDAT = /(?:\+|\b00)?\s*\d[\d\s().\-]{5,}\d/g;

// Longueur correcte mais numéro manifestement fictif : 06 00 00 00 00, 6 12 34 56 78 9…
function estSuspect(national) {
  const fin = national.slice(1);   // le premier chiffre est souvent un préfixe d'opérateur
  return new Set(fin).size <= 1 || '0123456789'.includes(fin) || '9876543210'.includes(fin);
}

function compterLongueurs(longueurs) {
  return longueurs.length === 1 ? String(longueurs[0]) : `${longueurs.slice(0, -1).join(', ')} ou ${longueurs[longueurs.length - 1]}`;
}

// Analyse un numéro isolé. Renvoie { statut, ... } avec statut parmi :
// valide | suspect | trop_long | trop_court | indicatif_manquant | inverifiable
function analyserNumero(brut) {
  const texte = String(brut).replace(/\(0\)/g, '').trim();   // « +33 (0)6… » : le (0) est décoratif
  const international = /^(\+|00)/.test(texte);
  let chiffres = texte.replace(/\D/g, '');
  if (texte.startsWith('00')) chiffres = chiffres.slice(2);   // 00 225… équivaut à +225…

  if (!international) {
    return { statut: 'indicatif_manquant', brut: texte, total: chiffres.length };
  }
  if (chiffres.length > 15) {   // plafond international (norme E.164)
    return { statut: 'trop_long', brut: texte, total: chiffres.length, attendu: '15 au maximum (norme internationale)' };
  }
  // Les indicatifs sont sans préfixe commun : la plus longue correspondance est la bonne.
  let indicatif = null;
  for (const n of [3, 2, 1]) {
    if (PAYS[chiffres.slice(0, n)]) { indicatif = chiffres.slice(0, n); break; }
  }
  if (!indicatif) {
    return { statut: 'inverifiable', brut: texte, total: chiffres.length };
  }
  const pays = PAYS[indicatif];
  let national = chiffres.slice(indicatif.length);
  if (pays.zero && national.startsWith('0') && pays.longueurs.includes(national.length - 1)) {
    national = national.slice(1);
  }
  const base = { brut: texte, indicatif, pays: pays.nom, obtenu: national.length, attendu: compterLongueurs(pays.longueurs) };
  if (pays.longueurs.includes(national.length)) {
    return { statut: estSuspect(national) ? 'suspect' : 'valide', ...base };
  }
  return { statut: national.length > Math.max(...pays.longueurs) ? 'trop_long' : 'trop_court', ...base };
}

// Repère les numéros dans un message libre. Sans indicatif, il faut au moins 9 chiffres :
// « 2024-2026 » ou un code postal ne sont pas des numéros.
function trouverNumeros(texte) {
  const trouves = String(texte).match(CANDIDAT) || [];
  return trouves.map(s => s.trim()).filter(s => {
    const n = s.replace(/\D/g, '').length;
    return /^(\+|00)/.test(s) ? n >= 8 : n >= 9;
  });
}

const INVALIDES = new Set(['trop_long', 'trop_court', 'indicatif_manquant']);

// true si le message contient au moins un numéro refusé.
function contientNumeroInvalide(texte) {
  return trouverNumeros(texte).some(n => INVALIDES.has(analyserNumero(n).statut));
}

// Note destinée au modèle (jamais affichée au visiteur).
// essaisPrecedents : nombre de messages précédents du visiteur qui contenaient déjà un numéro refusé.
function noteVerification(texte, essaisPrecedents = 0) {
  const numeros = trouverNumeros(texte);
  if (!numeros.length) return null;
  // Troisième numéro refusé : on arrête de redemander et on oriente vers un autre moyen de contact.
  if (essaisPrecedents >= 2 && contientNumeroInvalide(texte)) {
    return `Numéro encore INVALIDE (troisième tentative). Ne redemande plus le numéro : indique en une phrase qu'il n'a pas pu être vérifié et que la personne peut joindre Mohamed directement via les icônes de contact du portfolio. Ne produis pas de récapitulatif.`;
  }
  const lignes = numeros.map(n => {
    const r = analyserNumero(n);
    switch (r.statut) {
      case 'valide':
        return `« ${r.brut} » : numéro VALIDE (${r.pays}, +${r.indicatif}).`;
      case 'suspect':
        return `« ${r.brut} » : longueur correcte (${r.pays}) mais numéro qui ressemble à un exemple fictif. Demande poliment de confirmer que c'est bien son numéro ; s'il le confirme, accepte-le.`;
      case 'trop_long':
      case 'trop_court':
        return r.indicatif
          ? `« ${r.brut} » : numéro INVALIDE, ${r.obtenu} chiffres après l'indicatif +${r.indicatif} (${r.pays}) alors qu'un numéro de ce pays en compte ${r.attendu}. Il y a ${r.statut === 'trop_long' ? 'trop' : 'pas assez'} de chiffres : signale-le et redemande le numéro.`
          : `« ${r.brut} » : numéro INVALIDE, ${r.total} chiffres alors qu'un numéro international en compte ${r.attendu}. Redemande le numéro.`;
      case 'indicatif_manquant':
        return `« ${r.brut} » : INDICATIF MANQUANT. Demande le numéro au format international, avec l'indicatif du pays (par exemple +33 pour la France, +225 pour la Côte d'Ivoire).`;
      default:
        return `« ${r.brut} » : indicatif non répertorié, longueur non vérifiable automatiquement. Accepte-le s'il paraît plausible.`;
    }
  });
  return lignes.join(' ');
}

// Contrôle final du numéro inscrit dans le récapitulatif. true si le dossier peut partir.
function telephoneAcceptable(valeur) {
  const numeros = trouverNumeros(valeur);
  if (numeros.length !== 1) return false;
  const statut = analyserNumero(numeros[0]).statut;
  return statut === 'valide' || statut === 'suspect' || statut === 'inverifiable';
}

module.exports = { analyserNumero, trouverNumeros, contientNumeroInvalide, noteVerification, telephoneAcceptable };
