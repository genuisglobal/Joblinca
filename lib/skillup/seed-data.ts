import { QuizQuestion } from './types';

interface SeedModule {
  title: string;
  title_fr: string;
  content_type: 'video' | 'article' | 'external';
  video_url?: string;
  article_body: string;
  article_body_fr: string;
  duration_minutes: number;
  quiz_questions: QuizQuestion[];
  display_order: number;
}

interface SeedCourse {
  title: string;
  title_fr: string;
  description: string;
  description_fr: string;
  slug: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimated_minutes: number;
  partner_name?: string;
  partner_url?: string;
  display_order: number;
  modules: SeedModule[];
}

interface SeedTrack {
  title: string;
  title_fr: string;
  description: string;
  description_fr: string;
  slug: string;
  icon: string;
  target_roles: string[];
  display_order: number;
  courses: SeedCourse[];
}

export const seedTracks: SeedTrack[] = [
  // ===== TRACK 1: Career Foundations (talent) =====
  {
    title: 'Career Foundations',
    title_fr: 'Fondations de Carrière',
    description: 'Build essential workplace skills that every professional needs.',
    description_fr: 'Développez les compétences essentielles dont chaque professionnel a besoin.',
    slug: 'career-foundations',
    icon: 'foundation',
    target_roles: ['talent'],
    display_order: 1,
    courses: [
      {
        title: 'Problem Solving for Work',
        title_fr: 'Résolution de Problèmes au Travail',
        description: 'Learn structured approaches to tackle workplace challenges effectively.',
        description_fr: 'Apprenez des approches structurées pour relever efficacement les défis professionnels.',
        slug: 'problem-solving',
        difficulty: 'beginner',
        estimated_minutes: 15,
        display_order: 1,
        modules: [
          {
            title: 'Breaking Down Problems',
            title_fr: 'Décomposer les Problèmes',
            content_type: 'article',
            article_body: `# Breaking Down Problems\n\nThe first step to solving any problem is understanding it. Large, complex problems can feel overwhelming, but when you break them into smaller parts, each piece becomes manageable.\n\n## The 4-Step Method\n\n1. **Define** — What exactly is the problem? Write it in one sentence.\n2. **Divide** — Split the problem into 2-4 smaller sub-problems.\n3. **Solve** — Tackle each sub-problem individually.\n4. **Combine** — Put the solutions together and verify.\n\n## Example\n\n**Problem:** "Our team keeps missing deadlines."\n\n- Sub-problem 1: Are deadlines realistic?\n- Sub-problem 2: Are tasks clearly assigned?\n- Sub-problem 3: Are there blockers not being communicated?\n\nBy addressing each sub-problem, the bigger issue becomes solvable.\n\n## Tips\n\n- Write problems down — don't just think about them\n- Use diagrams or lists to visualize parts\n- Ask "why" 5 times to get to root causes`,
            article_body_fr: `# Décomposer les Problèmes\n\nLa première étape pour résoudre un problème est de le comprendre. Les problèmes complexes peuvent sembler accablants, mais quand vous les décomposez en petites parties, chaque morceau devient gérable.\n\n## La Méthode en 4 Étapes\n\n1. **Définir** — Quel est exactement le problème ? Écrivez-le en une phrase.\n2. **Diviser** — Divisez le problème en 2-4 sous-problèmes.\n3. **Résoudre** — Traitez chaque sous-problème individuellement.\n4. **Combiner** — Assemblez les solutions et vérifiez.\n\n## Exemple\n\n**Problème :** « Notre équipe rate constamment les délais. »\n\n- Sous-problème 1 : Les délais sont-ils réalistes ?\n- Sous-problème 2 : Les tâches sont-elles clairement assignées ?\n- Sous-problème 3 : Y a-t-il des blocages non communiqués ?\n\n## Conseils\n\n- Écrivez les problèmes — ne vous contentez pas d'y penser\n- Utilisez des diagrammes ou des listes\n- Demandez « pourquoi » 5 fois pour trouver les causes profondes`,
            duration_minutes: 5,
            display_order: 1,
            quiz_questions: [
              {
                question: 'What is the first step in the 4-step problem-solving method?',
                question_fr: 'Quelle est la première étape de la méthode en 4 étapes ?',
                options: ['Solve', 'Define', 'Divide', 'Combine'],
                options_fr: ['Résoudre', 'Définir', 'Diviser', 'Combiner'],
                correct_index: 1,
                explanation: 'You must define the problem clearly before trying to break it down or solve it.',
                explanation_fr: 'Vous devez définir le problème clairement avant de le décomposer ou de le résoudre.',
              },
              {
                question: 'What technique helps find root causes?',
                question_fr: 'Quelle technique aide à trouver les causes profondes ?',
                options: ['Ask "why" 5 times', 'Brainstorm solutions', 'Vote on answers', 'Skip to fixing'],
                options_fr: ['Demander « pourquoi » 5 fois', 'Brainstormer des solutions', 'Voter sur les réponses', 'Passer directement à la correction'],
                correct_index: 0,
                explanation: 'The "5 Whys" technique helps drill down to the root cause of a problem.',
                explanation_fr: 'La technique des « 5 Pourquoi » aide à creuser jusqu\'à la cause profonde.',
              },
              {
                question: 'How many sub-problems should you aim to split into?',
                question_fr: 'En combien de sous-problèmes devez-vous viser à diviser ?',
                options: ['1', '2-4', '10+', 'As many as possible'],
                options_fr: ['1', '2-4', '10+', 'Autant que possible'],
                correct_index: 1,
                explanation: '2-4 sub-problems keeps it manageable without over-complicating.',
                explanation_fr: '2-4 sous-problèmes restent gérables sans trop compliquer.',
              },
            ],
          },
          {
            title: 'Structured Thinking',
            title_fr: 'Pensée Structurée',
            content_type: 'article',
            article_body: `# Structured Thinking\n\nStructured thinking is the ability to organize information logically. It's a skill that top consultants and managers use daily.\n\n## MECE Framework\n\nMECE stands for **Mutually Exclusive, Collectively Exhaustive**:\n- **Mutually Exclusive:** Categories don't overlap\n- **Collectively Exhaustive:** Categories cover everything\n\n## Example: Analyzing Sales Drop\n\nInstead of random guesses, structure it:\n- **External factors:** Economy, competition, seasonality\n- **Internal factors:** Product quality, pricing, team performance\n- **Customer factors:** Satisfaction, needs changed, found alternatives\n\nEach category is distinct, and together they cover all possibilities.\n\n## Decision Matrix\n\nWhen choosing between options:\n| Criteria | Option A | Option B |\n|----------|----------|----------|\n| Cost     | Low      | High     |\n| Speed    | Fast     | Slow     |\n| Quality  | Medium   | High     |\n\nScore each and compare totals.`,
            article_body_fr: `# Pensée Structurée\n\nLa pensée structurée est la capacité d'organiser l'information de manière logique. C'est une compétence que les meilleurs consultants utilisent quotidiennement.\n\n## Cadre MECE\n\nMECE signifie **Mutuellement Exclusif, Collectivement Exhaustif** :\n- **Mutuellement Exclusif :** Les catégories ne se chevauchent pas\n- **Collectivement Exhaustif :** Les catégories couvrent tout\n\n## Exemple : Analyser une Baisse des Ventes\n\n- **Facteurs externes :** Économie, concurrence, saisonnalité\n- **Facteurs internes :** Qualité produit, prix, performance équipe\n- **Facteurs clients :** Satisfaction, besoins changés, alternatives trouvées\n\n## Matrice de Décision\n\nPour choisir entre les options, évaluez chaque critère et comparez les totaux.`,
            duration_minutes: 5,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What does MECE stand for?',
                question_fr: 'Que signifie MECE ?',
                options: ['Most Effective, Cost Efficient', 'Mutually Exclusive, Collectively Exhaustive', 'Maximum Effort, Complete Execution', 'Measured Elements, Counted Exactly'],
                options_fr: ['Le Plus Efficace, Coût Efficient', 'Mutuellement Exclusif, Collectivement Exhaustif', 'Effort Maximum, Exécution Complète', 'Éléments Mesurés, Comptés Exactement'],
                correct_index: 1,
                explanation: 'MECE ensures your analysis categories don\'t overlap and cover all possibilities.',
              },
              {
                question: 'What tool helps compare multiple options across criteria?',
                question_fr: 'Quel outil aide à comparer plusieurs options selon des critères ?',
                options: ['Pie chart', 'Decision matrix', 'Flow chart', 'Mind map'],
                options_fr: ['Diagramme circulaire', 'Matrice de décision', 'Organigramme', 'Carte mentale'],
                correct_index: 1,
              },
              {
                question: 'In the sales analysis example, which is NOT one of the main categories?',
                question_fr: 'Dans l\'exemple d\'analyse des ventes, lequel n\'est PAS une catégorie principale ?',
                options: ['External factors', 'Internal factors', 'Customer factors', 'Weather factors'],
                options_fr: ['Facteurs externes', 'Facteurs internes', 'Facteurs clients', 'Facteurs météorologiques'],
                correct_index: 3,
              },
            ],
          },
          {
            title: 'Practice Scenarios',
            title_fr: 'Scénarios Pratiques',
            content_type: 'article',
            article_body: `# Practice Scenarios\n\nLet's apply what you've learned to real workplace situations common in Cameroon.\n\n## Scenario 1: Office Supply Shortage\n\nYour office printer has been breaking down weekly. Using the 4-step method:\n1. **Define:** The office printer breaks down every week, causing delays\n2. **Divide:** Is it the machine? The usage volume? The maintenance schedule?\n3. **Solve:** Check each: maybe it needs servicing, or perhaps a second printer is needed\n4. **Combine:** Implement maintenance schedule AND request backup printer\n\n## Scenario 2: Team Communication\n\nTeam members in Douala and Yaoundé offices aren't coordinating well.\n- Apply MECE: Technology issues? Process issues? People issues?\n- For each, identify specific fixes\n\n## Scenario 3: Client Complaint\n\nA client says your deliverable is "not what they expected."\n- Ask "why" 5 times to find the gap\n- Was the brief unclear? Was there a miscommunication? Did requirements change?\n\n## Your Turn\n\nThink about a real problem you face at work. Write it down and apply these frameworks.`,
            article_body_fr: `# Scénarios Pratiques\n\nAppliquons ce que vous avez appris à des situations professionnelles courantes au Cameroun.\n\n## Scénario 1 : Pénurie de Fournitures\n\nVotre imprimante de bureau tombe en panne chaque semaine.\n1. **Définir :** L'imprimante tombe en panne chaque semaine, causant des retards\n2. **Diviser :** Est-ce la machine ? Le volume d'utilisation ? Le calendrier de maintenance ?\n3. **Résoudre :** Vérifiez chaque point\n4. **Combiner :** Mettez en place un calendrier de maintenance ET demandez une imprimante de secours\n\n## Scénario 2 : Communication d'Équipe\n\nLes membres de l'équipe à Douala et Yaoundé ne se coordonnent pas bien.\n- Appliquez MECE : Problèmes technologiques ? Problèmes de processus ? Problèmes humains ?\n\n## Scénario 3 : Plainte Client\n\nUn client dit que votre livrable « ne correspond pas à ses attentes ».\n- Demandez « pourquoi » 5 fois pour trouver l'écart\n\n## À Votre Tour\n\nPensez à un vrai problème au travail. Écrivez-le et appliquez ces cadres.`,
            duration_minutes: 5,
            display_order: 3,
            quiz_questions: [
              {
                question: 'In Scenario 1, what was the combined solution?',
                question_fr: 'Dans le Scénario 1, quelle était la solution combinée ?',
                options: ['Buy a new printer', 'Maintenance schedule AND backup printer', 'Stop printing', 'Outsource printing'],
                options_fr: ['Acheter une nouvelle imprimante', 'Calendrier de maintenance ET imprimante de secours', 'Arrêter d\'imprimer', 'Externaliser l\'impression'],
                correct_index: 1,
              },
              {
                question: 'What framework helps analyze the Douala-Yaoundé coordination problem?',
                question_fr: 'Quel cadre aide à analyser le problème de coordination Douala-Yaoundé ?',
                options: ['5 Whys', 'MECE', '4-Step Method', 'SWOT'],
                options_fr: ['5 Pourquoi', 'MECE', 'Méthode en 4 étapes', 'SWOT'],
                correct_index: 1,
              },
              {
                question: 'For the client complaint, which technique is recommended?',
                question_fr: 'Pour la plainte client, quelle technique est recommandée ?',
                options: ['Decision matrix', 'Brainstorming', 'Ask "why" 5 times', 'MECE analysis'],
                options_fr: ['Matrice de décision', 'Brainstorming', 'Demander « pourquoi » 5 fois', 'Analyse MECE'],
                correct_index: 2,
              },
            ],
          },
        ],
      },
      {
        title: 'Professional Communication',
        title_fr: 'Communication Professionnelle',
        description: 'Master written and verbal professional communication.',
        description_fr: 'Maîtrisez la communication professionnelle écrite et verbale.',
        slug: 'professional-communication',
        difficulty: 'beginner',
        estimated_minutes: 15,
        display_order: 2,
        modules: [
          {
            title: 'Professional Emails',
            title_fr: 'Emails Professionnels',
            content_type: 'article',
            article_body: `# Writing Professional Emails\n\nEmail is still the #1 professional communication tool. A well-written email can open doors.\n\n## Structure\n\n1. **Subject Line:** Clear and specific (e.g., "Meeting Request: Q1 Review — Jan 15")\n2. **Greeting:** "Dear Mr./Ms. [Name]" or "Hello [Name]"\n3. **Opening:** State your purpose in the first sentence\n4. **Body:** Keep it concise — ideally under 5 sentences\n5. **Call to Action:** What do you want the reader to do?\n6. **Closing:** "Best regards," or "Kind regards,"\n\n## Common Mistakes\n\n- Writing "Dear Sir/Madam" when you know the person's name\n- Forgetting attachments (mention them in the body first)\n- Using ALL CAPS (reads as shouting)\n- Sending without proofreading\n\n## Template\n\n> Subject: Application Follow-up — [Position] at [Company]\n>\n> Dear [Name],\n>\n> I hope this message finds you well. I submitted my application for the [Position] role on [Date] and wanted to follow up on its status.\n>\n> I remain very interested in the opportunity and am happy to provide any additional information.\n>\n> Best regards,\n> [Your Name]`,
            article_body_fr: `# Rédiger des Emails Professionnels\n\nL'email est le premier outil de communication professionnelle. Un email bien écrit peut ouvrir des portes.\n\n## Structure\n\n1. **Objet :** Clair et spécifique\n2. **Salutation :** « Cher M./Mme [Nom] » ou « Bonjour [Nom] »\n3. **Introduction :** Énoncez votre objectif dès la première phrase\n4. **Corps :** Restez concis — idéalement moins de 5 phrases\n5. **Appel à l'action :** Que voulez-vous que le lecteur fasse ?\n6. **Formule de politesse :** « Cordialement » ou « Bien à vous »\n\n## Erreurs Courantes\n\n- Écrire « Madame, Monsieur » quand vous connaissez le nom\n- Oublier les pièces jointes\n- Utiliser les MAJUSCULES\n- Envoyer sans relire`,
            duration_minutes: 5,
            display_order: 1,
            quiz_questions: [
              {
                question: 'What should the first sentence of a professional email contain?',
                question_fr: 'Que devrait contenir la première phrase d\'un email professionnel ?',
                options: ['A joke', 'Your purpose', 'A compliment', 'Your full biography'],
                options_fr: ['Une blague', 'Votre objectif', 'Un compliment', 'Votre biographie complète'],
                correct_index: 1,
              },
              {
                question: 'Why should you avoid ALL CAPS in emails?',
                question_fr: 'Pourquoi devez-vous éviter les MAJUSCULES dans les emails ?',
                options: ['It\'s hard to read', 'It reads as shouting', 'It\'s unprofessional', 'All of the above'],
                options_fr: ['C\'est difficile à lire', 'Cela se lit comme crier', 'C\'est non professionnel', 'Tout ce qui précède'],
                correct_index: 3,
              },
              {
                question: 'How many sentences should the email body ideally contain?',
                question_fr: 'Combien de phrases le corps de l\'email devrait-il idéalement contenir ?',
                options: ['1-2', 'Under 5', '10+', 'As many as needed'],
                options_fr: ['1-2', 'Moins de 5', '10+', 'Autant que nécessaire'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Workplace Conversations',
            title_fr: 'Conversations Professionnelles',
            content_type: 'article',
            article_body: `# Workplace Conversations\n\nVerbal communication at work is about being clear, respectful, and purposeful.\n\n## Key Principles\n\n1. **Listen first:** Understand before responding\n2. **Be direct:** Get to the point without being rude\n3. **Confirm understanding:** "So what I'm hearing is..."\n4. **Follow up in writing:** After important verbal conversations, send a summary email\n\n## Difficult Conversations\n\nWhen you disagree:\n- "I see your point, and I'd like to offer another perspective..."\n- "I understand the concern. Here's what I think we could do..."\n\nWhen asking for help:\n- "I've tried X and Y, but I'm stuck on Z. Could you help me think through it?"\n\nWhen giving feedback:\n- Use the SBI model: **Situation**, **Behavior**, **Impact**\n- "In yesterday's meeting (S), when you interrupted the client (B), it made us seem disorganized (I)"\n\n## Cultural Note for Cameroon\n\nRespect for hierarchy is important. When speaking with seniors:\n- Use titles (Mr., Dr., etc.)\n- Be respectful but don't shy away from sharing ideas\n- Frame suggestions as questions: "What if we tried..."`,
            article_body_fr: `# Conversations Professionnelles\n\nLa communication verbale au travail consiste à être clair, respectueux et intentionnel.\n\n## Principes Clés\n\n1. **Écouter d'abord :** Comprendre avant de répondre\n2. **Être direct :** Aller droit au but sans être impoli\n3. **Confirmer la compréhension :** « Ce que je comprends, c'est... »\n4. **Faire un suivi écrit :** Après les conversations importantes, envoyez un email récapitulatif\n\n## Conversations Difficiles\n\nQuand vous n'êtes pas d'accord :\n- « Je vois votre point, et j'aimerais offrir une autre perspective... »\n\nModèle SBI : **Situation**, **Comportement**, **Impact**\n\n## Note Culturelle pour le Cameroun\n\nLe respect de la hiérarchie est important. Utilisez les titres et formulez les suggestions comme des questions.`,
            duration_minutes: 5,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What does SBI stand for in the feedback model?',
                question_fr: 'Que signifie SBI dans le modèle de feedback ?',
                options: ['Simple, Brief, Important', 'Situation, Behavior, Impact', 'Start, Build, Improve', 'Speak, Balance, Inspire'],
                options_fr: ['Simple, Bref, Important', 'Situation, Comportement, Impact', 'Commencer, Construire, Améliorer', 'Parler, Équilibrer, Inspirer'],
                correct_index: 1,
              },
              {
                question: 'What should you do after an important verbal conversation?',
                question_fr: 'Que devez-vous faire après une conversation verbale importante ?',
                options: ['Forget about it', 'Send a summary email', 'Call them again', 'Post on social media'],
                options_fr: ['L\'oublier', 'Envoyer un email récapitulatif', 'Les rappeler', 'Publier sur les réseaux sociaux'],
                correct_index: 1,
              },
              {
                question: 'How should you frame suggestions when speaking with seniors in Cameroon?',
                question_fr: 'Comment formuler des suggestions en parlant aux supérieurs au Cameroun ?',
                options: ['As demands', 'As questions', 'As complaints', 'Don\'t make suggestions'],
                options_fr: ['Comme des exigences', 'Comme des questions', 'Comme des plaintes', 'Ne pas faire de suggestions'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Bilingual Tips for Cameroon',
            title_fr: 'Conseils Bilingues pour le Cameroun',
            content_type: 'article',
            article_body: `# Bilingual Communication Tips\n\nCameroon's bilingual environment (English & French) presents unique communication challenges and opportunities.\n\n## Navigating Bilingual Workplaces\n\n1. **Know your audience:** Check which language your colleague prefers\n2. **Code-switching:** It's OK to mix languages informally, but keep formal communications in one language\n3. **Translations:** When writing for both audiences, provide both versions rather than mixing\n\n## English-French Professional Terms\n\n| English | French |\n|---------|--------|\n| Meeting agenda | Ordre du jour |\n| Deadline | Date limite |\n| Follow-up | Suivi |\n| Deliverable | Livrable |\n| Stakeholder | Partie prenante |\n\n## Tips for Bilingual CVs\n\n- Have two versions of your CV, not one mixed version\n- Use the language of the job posting\n- If the company operates in both languages, prepare both versions\n\n## Cultural Advantage\n\nBeing bilingual in Cameroon is a major professional asset. Highlight it:\n- "Fluent in English and French, experienced in cross-cultural communication"\n- This is valuable for multinational companies, NGOs, and international organizations`,
            article_body_fr: `# Conseils de Communication Bilingue\n\nL'environnement bilingue du Cameroun (anglais et français) présente des défis et des opportunités uniques.\n\n## Naviguer dans les Milieux Bilingues\n\n1. **Connaître votre audience :** Vérifiez la langue préférée\n2. **Alternance codique :** C'est OK en informel, mais gardez les communications formelles dans une seule langue\n3. **Traductions :** Fournissez les deux versions plutôt que de mélanger\n\n## Termes Professionnels Anglais-Français\n\n| Anglais | Français |\n|---------|--------|\n| Meeting agenda | Ordre du jour |\n| Deadline | Date limite |\n| Follow-up | Suivi |\n\n## Conseils pour les CV Bilingues\n\n- Ayez deux versions de votre CV\n- Utilisez la langue de l'offre d'emploi\n\n## Avantage Culturel\n\nÊtre bilingue au Cameroun est un atout professionnel majeur. Mettez-le en valeur.`,
            duration_minutes: 5,
            display_order: 3,
            quiz_questions: [
              {
                question: 'What should you do for formal bilingual communications?',
                question_fr: 'Que devez-vous faire pour les communications bilingues formelles ?',
                options: ['Mix both languages', 'Keep in one language', 'Use only English', 'Use only French'],
                options_fr: ['Mélanger les deux langues', 'Garder une seule langue', 'Utiliser uniquement l\'anglais', 'Utiliser uniquement le français'],
                correct_index: 1,
              },
              {
                question: 'How many CV versions should a bilingual professional maintain?',
                question_fr: 'Combien de versions de CV un professionnel bilingue devrait-il maintenir ?',
                options: ['One mixed version', 'Two separate versions', 'Three versions', 'Only English'],
                options_fr: ['Une version mixte', 'Deux versions séparées', 'Trois versions', 'Uniquement en anglais'],
                correct_index: 1,
              },
              {
                question: 'What is "deadline" in French?',
                question_fr: 'Comment dit-on « deadline » en français ?',
                options: ['Suivi', 'Livrable', 'Date limite', 'Ordre du jour'],
                options_fr: ['Suivi', 'Livrable', 'Date limite', 'Ordre du jour'],
                correct_index: 2,
              },
            ],
          },
        ],
      },
      {
        title: 'Git & GitHub Basics',
        title_fr: 'Git & GitHub - Les Bases',
        description: 'Learn version control fundamentals with Git and GitHub.',
        description_fr: 'Apprenez les fondamentaux du contrôle de version avec Git et GitHub.',
        slug: 'git-github-basics',
        difficulty: 'beginner',
        estimated_minutes: 18,
        partner_name: 'freeCodeCamp',
        partner_url: 'https://www.freecodecamp.org/news/git-and-github-for-beginners/',
        display_order: 3,
        modules: [
          {
            title: 'Version Control Intro',
            title_fr: 'Introduction au Contrôle de Version',
            content_type: 'article',
            article_body: `# Version Control Introduction\n\nVersion control is a system that records changes to files over time. Think of it as an "undo history" for your entire project.\n\n## Why Version Control?\n\n- **Track changes:** See who changed what and when\n- **Collaboration:** Multiple people can work on the same project\n- **Backup:** Your code history is saved\n- **Branching:** Try new ideas without breaking existing work\n\n## Git Basics\n\nGit is the most popular version control system. Key concepts:\n\n- **Repository (repo):** A project folder tracked by Git\n- **Commit:** A saved snapshot of your changes\n- **Branch:** A parallel version of your code\n- **Merge:** Combining changes from different branches\n\n## Essential Commands\n\n\`\`\`bash\ngit init          # Start a new repo\ngit add .         # Stage all changes\ngit commit -m "message"  # Save a snapshot\ngit status        # Check what's changed\ngit log           # See commit history\n\`\`\``,
            article_body_fr: `# Introduction au Contrôle de Version\n\nLe contrôle de version est un système qui enregistre les modifications des fichiers au fil du temps.\n\n## Pourquoi le Contrôle de Version ?\n\n- **Suivre les changements**\n- **Collaboration**\n- **Sauvegarde**\n- **Branches**\n\n## Bases de Git\n\n- **Dépôt (repo) :** Un dossier de projet suivi par Git\n- **Commit :** Un instantané sauvegardé\n- **Branche :** Une version parallèle\n- **Merge :** Combiner les changements\n\n## Commandes Essentielles\n\n\`\`\`bash\ngit init          # Démarrer un nouveau dépôt\ngit add .         # Indexer tous les changements\ngit commit -m "message"  # Sauvegarder\ngit status        # Vérifier les changements\n\`\`\``,
            duration_minutes: 6,
            display_order: 1,
            quiz_questions: [
              {
                question: 'What does "git init" do?',
                question_fr: 'Que fait « git init » ?',
                options: ['Deletes a repo', 'Starts a new repo', 'Commits changes', 'Pushes to GitHub'],
                options_fr: ['Supprime un dépôt', 'Démarre un nouveau dépôt', 'Enregistre les changements', 'Pousse vers GitHub'],
                correct_index: 1,
              },
              {
                question: 'What is a "commit" in Git?',
                question_fr: 'Qu\'est-ce qu\'un « commit » dans Git ?',
                options: ['A promise', 'A saved snapshot of changes', 'A branch name', 'A file type'],
                options_fr: ['Une promesse', 'Un instantané sauvegardé des changements', 'Un nom de branche', 'Un type de fichier'],
                correct_index: 1,
              },
              {
                question: 'Which command shows commit history?',
                question_fr: 'Quelle commande affiche l\'historique des commits ?',
                options: ['git status', 'git log', 'git add', 'git branch'],
                options_fr: ['git status', 'git log', 'git add', 'git branch'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'First Repository',
            title_fr: 'Premier Dépôt',
            content_type: 'article',
            article_body: `# Creating Your First Repository\n\n## Step-by-Step Guide\n\n### 1. Create a GitHub Account\nGo to github.com and sign up for free.\n\n### 2. Create a New Repository\n- Click the "+" button → "New repository"\n- Name it (e.g., "my-first-project")\n- Add a README file\n- Click "Create repository"\n\n### 3. Clone to Your Computer\n\`\`\`bash\ngit clone https://github.com/yourusername/my-first-project.git\ncd my-first-project\n\`\`\`\n\n### 4. Make Changes\n- Edit the README.md file\n- Create new files\n\n### 5. Save and Push\n\`\`\`bash\ngit add .\ngit commit -m "Add my first changes"\ngit push origin main\n\`\`\`\n\n## Best Practices\n\n- Write clear commit messages\n- Commit often (small, focused changes)\n- Use .gitignore to exclude files you don't want to track\n- Never commit passwords or API keys`,
            article_body_fr: `# Créer Votre Premier Dépôt\n\n## Guide Étape par Étape\n\n### 1. Créer un Compte GitHub\nAllez sur github.com et inscrivez-vous gratuitement.\n\n### 2. Créer un Nouveau Dépôt\n- Cliquez sur « + » → « New repository »\n- Nommez-le\n- Ajoutez un fichier README\n\n### 3. Cloner sur Votre Ordinateur\n\`\`\`bash\ngit clone https://github.com/votre-nom/mon-premier-projet.git\n\`\`\`\n\n### 4. Faire des Modifications\n\n### 5. Sauvegarder et Pousser\n\`\`\`bash\ngit add .\ngit commit -m "Ajouter mes premiers changements"\ngit push origin main\n\`\`\`\n\n## Bonnes Pratiques\n\n- Messages de commit clairs\n- Commit souvent\n- Utiliser .gitignore\n- Ne jamais committer des mots de passe`,
            duration_minutes: 6,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What command downloads a repository to your computer?',
                question_fr: 'Quelle commande télécharge un dépôt sur votre ordinateur ?',
                options: ['git push', 'git clone', 'git pull', 'git download'],
                options_fr: ['git push', 'git clone', 'git pull', 'git download'],
                correct_index: 1,
              },
              {
                question: 'What should you NEVER commit to a repository?',
                question_fr: 'Que ne devez-vous JAMAIS committer dans un dépôt ?',
                options: ['README files', 'Source code', 'Passwords and API keys', 'Documentation'],
                options_fr: ['Fichiers README', 'Code source', 'Mots de passe et clés API', 'Documentation'],
                correct_index: 2,
              },
              {
                question: 'What does "git push origin main" do?',
                question_fr: 'Que fait « git push origin main » ?',
                options: ['Creates a branch', 'Uploads commits to GitHub', 'Deletes the repo', 'Reverts changes'],
                options_fr: ['Crée une branche', 'Envoie les commits sur GitHub', 'Supprime le dépôt', 'Annule les changements'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Pull Requests',
            title_fr: 'Pull Requests',
            content_type: 'article',
            article_body: `# Pull Requests\n\nPull Requests (PRs) are how teams review and merge code changes on GitHub.\n\n## The Workflow\n\n1. Create a branch for your feature\n\`\`\`bash\ngit checkout -b feature/add-login-page\n\`\`\`\n\n2. Make your changes and commit\n\`\`\`bash\ngit add .\ngit commit -m "Add login page"\ngit push origin feature/add-login-page\n\`\`\`\n\n3. On GitHub, click "New Pull Request"\n4. Select your branch → main\n5. Write a description of your changes\n6. Request reviewers\n7. After approval, merge the PR\n\n## PR Best Practices\n\n- Keep PRs small and focused\n- Write a clear description\n- Link to any related issues\n- Respond to review comments promptly\n- Don't merge your own PRs without review (in a team)\n\n## Code Review Tips\n\nWhen reviewing others' PRs:\n- Be constructive and kind\n- Suggest improvements, don't demand\n- Approve when it's good enough (not perfect)`,
            article_body_fr: `# Pull Requests\n\nLes Pull Requests (PRs) sont la façon dont les équipes révisent et fusionnent les changements de code sur GitHub.\n\n## Le Flux de Travail\n\n1. Créer une branche pour votre fonctionnalité\n2. Faire vos changements et committer\n3. Sur GitHub, cliquez « New Pull Request »\n4. Sélectionnez votre branche → main\n5. Écrivez une description\n6. Demandez des reviewers\n7. Après approbation, fusionnez le PR\n\n## Bonnes Pratiques\n\n- PRs petits et focalisés\n- Description claire\n- Lier les issues associées\n- Répondre rapidement aux commentaires`,
            duration_minutes: 6,
            display_order: 3,
            quiz_questions: [
              {
                question: 'What is the first step when creating a new feature?',
                question_fr: 'Quelle est la première étape pour créer une nouvelle fonctionnalité ?',
                options: ['Merge to main', 'Create a branch', 'Delete old code', 'Create a PR'],
                options_fr: ['Fusionner dans main', 'Créer une branche', 'Supprimer l\'ancien code', 'Créer un PR'],
                correct_index: 1,
              },
              {
                question: 'When reviewing code, you should:',
                question_fr: 'Lors de la revue de code, vous devez :',
                options: ['Demand perfection', 'Be constructive and kind', 'Reject everything', 'Skip the description'],
                options_fr: ['Exiger la perfection', 'Être constructif et bienveillant', 'Tout rejeter', 'Ignorer la description'],
                correct_index: 1,
              },
              {
                question: 'What command creates a new branch?',
                question_fr: 'Quelle commande crée une nouvelle branche ?',
                options: ['git branch delete', 'git checkout -b', 'git merge', 'git push'],
                options_fr: ['git branch delete', 'git checkout -b', 'git merge', 'git push'],
                correct_index: 1,
              },
            ],
          },
        ],
      },
    ],
  },

  // ===== TRACK 2: Job Seeker Accelerator =====
  {
    title: 'Job Seeker Accelerator',
    title_fr: 'Accélérateur Chercheur d\'Emploi',
    description: 'Advanced skills to stand out in competitive job markets.',
    description_fr: 'Compétences avancées pour se démarquer sur les marchés de l\'emploi compétitifs.',
    slug: 'job-seeker-accelerator',
    icon: 'rocket',
    target_roles: ['job_seeker'],
    display_order: 2,
    courses: [
      {
        title: 'SQL for Data Roles',
        title_fr: 'SQL pour les Rôles Data',
        description: 'Master SQL skills needed for data analyst and developer positions.',
        description_fr: 'Maîtrisez les compétences SQL nécessaires pour les postes d\'analyste de données.',
        slug: 'sql-data-roles',
        difficulty: 'intermediate',
        estimated_minutes: 18,
        partner_name: 'DataGenius Academy',
        partner_url: 'https://datacamp.com/courses/introduction-to-sql',
        display_order: 1,
        modules: [
          {
            title: 'SELECT & JOIN',
            title_fr: 'SELECT & JOIN',
            content_type: 'article',
            article_body: `# SQL SELECT & JOIN\n\n## SELECT Basics\n\nSELECT retrieves data from a database table.\n\n\`\`\`sql\n-- Get all columns from employees\nSELECT * FROM employees;\n\n-- Get specific columns\nSELECT first_name, last_name, salary FROM employees;\n\n-- Filter with WHERE\nSELECT * FROM employees WHERE department = 'Engineering';\n\n-- Sort results\nSELECT * FROM employees ORDER BY salary DESC;\n\`\`\`\n\n## JOIN Types\n\nJOINs combine rows from multiple tables.\n\n\`\`\`sql\n-- INNER JOIN: only matching rows\nSELECT e.name, d.department_name\nFROM employees e\nINNER JOIN departments d ON e.dept_id = d.id;\n\n-- LEFT JOIN: all from left table, matches from right\nSELECT e.name, d.department_name\nFROM employees e\nLEFT JOIN departments d ON e.dept_id = d.id;\n\`\`\`\n\n## Key Differences\n\n| Join Type | Returns |\n|-----------|--------|\n| INNER JOIN | Only matching rows from both tables |\n| LEFT JOIN | All rows from left + matches from right |\n| RIGHT JOIN | All rows from right + matches from left |\n| FULL JOIN | All rows from both tables |`,
            article_body_fr: `# SQL SELECT & JOIN\n\n## Bases du SELECT\n\n\`\`\`sql\nSELECT * FROM employees;\nSELECT first_name, last_name FROM employees WHERE department = 'Engineering';\n\`\`\`\n\n## Types de JOIN\n\n| Type | Retourne |\n|------|--------|\n| INNER JOIN | Seulement les lignes correspondantes |\n| LEFT JOIN | Toutes les lignes de gauche + correspondances |\n| RIGHT JOIN | Toutes les lignes de droite + correspondances |`,
            duration_minutes: 6,
            display_order: 1,
            quiz_questions: [
              {
                question: 'Which SQL keyword filters rows based on a condition?',
                question_fr: 'Quel mot-clé SQL filtre les lignes selon une condition ?',
                options: ['SELECT', 'FROM', 'WHERE', 'ORDER BY'],
                correct_index: 2,
              },
              {
                question: 'What does INNER JOIN return?',
                question_fr: 'Que retourne un INNER JOIN ?',
                options: ['All rows from both tables', 'Only matching rows from both tables', 'All rows from left table', 'No rows'],
                correct_index: 1,
              },
              {
                question: 'Which JOIN returns all rows from the left table?',
                question_fr: 'Quel JOIN retourne toutes les lignes de la table de gauche ?',
                options: ['INNER JOIN', 'RIGHT JOIN', 'LEFT JOIN', 'CROSS JOIN'],
                correct_index: 2,
              },
            ],
          },
          {
            title: 'Aggregation & Subqueries',
            title_fr: 'Agrégation & Sous-requêtes',
            content_type: 'article',
            article_body: `# Aggregation & Subqueries\n\n## Aggregate Functions\n\n\`\`\`sql\nSELECT \n  department,\n  COUNT(*) as employee_count,\n  AVG(salary) as avg_salary,\n  MAX(salary) as max_salary,\n  MIN(salary) as min_salary,\n  SUM(salary) as total_salary\nFROM employees\nGROUP BY department;\n\`\`\`\n\n## HAVING vs WHERE\n\n- **WHERE** filters rows before grouping\n- **HAVING** filters groups after aggregation\n\n\`\`\`sql\nSELECT department, AVG(salary) as avg_sal\nFROM employees\nWHERE hire_date > '2023-01-01'\nGROUP BY department\nHAVING AVG(salary) > 50000;\n\`\`\`\n\n## Subqueries\n\n\`\`\`sql\n-- Find employees earning above average\nSELECT name, salary\nFROM employees\nWHERE salary > (SELECT AVG(salary) FROM employees);\n\n-- Find departments with no employees\nSELECT department_name\nFROM departments\nWHERE id NOT IN (SELECT DISTINCT dept_id FROM employees);\n\`\`\``,
            article_body_fr: `# Agrégation & Sous-requêtes\n\n## Fonctions d'Agrégation\n\nCOUNT, AVG, MAX, MIN, SUM avec GROUP BY.\n\n## HAVING vs WHERE\n\n- **WHERE** filtre les lignes avant le regroupement\n- **HAVING** filtre les groupes après l'agrégation\n\n## Sous-requêtes\n\nRequêtes imbriquées dans d'autres requêtes pour des analyses complexes.`,
            duration_minutes: 6,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What is the difference between WHERE and HAVING?',
                question_fr: 'Quelle est la différence entre WHERE et HAVING ?',
                options: ['No difference', 'WHERE filters before grouping, HAVING filters after', 'HAVING is faster', 'WHERE only works with numbers'],
                correct_index: 1,
              },
              {
                question: 'Which function counts the number of rows?',
                question_fr: 'Quelle fonction compte le nombre de lignes ?',
                options: ['SUM()', 'AVG()', 'COUNT(*)', 'MAX()'],
                correct_index: 2,
              },
              {
                question: 'What is a subquery?',
                question_fr: 'Qu\'est-ce qu\'une sous-requête ?',
                options: ['A query that deletes data', 'A query nested inside another query', 'A query that creates tables', 'A query that only works with JOINs'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'SQL Interview Practice',
            title_fr: 'Pratique Entretien SQL',
            content_type: 'article',
            article_body: `# SQL Interview Practice\n\nCommon SQL questions asked in data analyst and developer interviews.\n\n## Question 1: Second Highest Salary\n\n\`\`\`sql\nSELECT MAX(salary) as second_highest\nFROM employees\nWHERE salary < (SELECT MAX(salary) FROM employees);\n\`\`\`\n\n## Question 2: Duplicate Emails\n\n\`\`\`sql\nSELECT email, COUNT(*) as count\nFROM users\nGROUP BY email\nHAVING COUNT(*) > 1;\n\`\`\`\n\n## Question 3: Running Total\n\n\`\`\`sql\nSELECT \n  date,\n  amount,\n  SUM(amount) OVER (ORDER BY date) as running_total\nFROM transactions;\n\`\`\`\n\n## Tips for SQL Interviews\n\n1. **Clarify the question** before writing\n2. **Start simple**, then optimize\n3. **Explain your thinking** out loud\n4. **Test with edge cases** (empty tables, NULLs)\n5. **Know window functions** — they're increasingly popular`,
            article_body_fr: `# Pratique Entretien SQL\n\nQuestions SQL courantes en entretien.\n\n## Question 1 : Deuxième Plus Haut Salaire\n## Question 2 : Emails en Double\n## Question 3 : Total Cumulé\n\n## Conseils\n\n1. Clarifiez la question avant d'écrire\n2. Commencez simple, puis optimisez\n3. Expliquez votre raisonnement\n4. Testez les cas limites\n5. Connaissez les fonctions fenêtrées`,
            duration_minutes: 6,
            display_order: 3,
            quiz_questions: [
              {
                question: 'How do you find duplicate emails in SQL?',
                question_fr: 'Comment trouver les emails en double en SQL ?',
                options: ['SELECT DISTINCT', 'GROUP BY + HAVING COUNT > 1', 'WHERE duplicate = true', 'JOIN on itself'],
                correct_index: 1,
              },
              {
                question: 'What SQL feature calculates running totals?',
                question_fr: 'Quelle fonctionnalité SQL calcule les totaux cumulés ?',
                options: ['GROUP BY', 'HAVING', 'Window functions (OVER)', 'Subquery'],
                correct_index: 2,
              },
              {
                question: 'What should you do FIRST in a SQL interview question?',
                question_fr: 'Que devez-vous faire EN PREMIER dans une question SQL d\'entretien ?',
                options: ['Write the query immediately', 'Clarify the question', 'Ask for the answer', 'Open documentation'],
                correct_index: 1,
              },
            ],
          },
        ],
      },
      {
        title: 'Cloud Basics: AWS & Azure',
        title_fr: 'Bases du Cloud : AWS & Azure',
        description: 'Understand cloud computing fundamentals for modern tech roles.',
        description_fr: 'Comprenez les fondamentaux du cloud computing pour les rôles tech modernes.',
        slug: 'cloud-basics',
        difficulty: 'intermediate',
        estimated_minutes: 18,
        partner_name: 'Coursera',
        partner_url: 'https://www.coursera.org/learn/cloud-computing-basics',
        display_order: 2,
        modules: [
          {
            title: 'What is Cloud Computing?',
            title_fr: 'Qu\'est-ce que le Cloud Computing ?',
            content_type: 'article',
            article_body: `# What is Cloud Computing?\n\nCloud computing delivers computing services (servers, storage, databases, networking, software) over the internet.\n\n## Key Benefits\n\n- **No upfront costs:** Pay only for what you use\n- **Scalability:** Scale up or down instantly\n- **Reliability:** Built-in redundancy and backups\n- **Global reach:** Deploy anywhere in the world\n\n## Service Models\n\n| Model | What You Manage | Example |\n|-------|----------------|--------|\n| IaaS | OS, apps, data | AWS EC2, Azure VMs |\n| PaaS | Apps and data only | Heroku, Azure App Service |\n| SaaS | Nothing (just use it) | Gmail, Salesforce |\n\n## Deployment Models\n\n- **Public Cloud:** Shared infrastructure (AWS, Azure, GCP)\n- **Private Cloud:** Dedicated to one organization\n- **Hybrid Cloud:** Mix of public and private`,
            article_body_fr: `# Qu'est-ce que le Cloud Computing ?\n\nLe cloud computing fournit des services informatiques via internet.\n\n## Avantages Clés\n\n- Pas de coûts initiaux\n- Évolutivité\n- Fiabilité\n- Portée mondiale\n\n## Modèles de Service\n\n| Modèle | Ce que vous gérez |\n|--------|-------------------|\n| IaaS | OS, apps, données |\n| PaaS | Apps et données seulement |\n| SaaS | Rien (utilisez simplement) |`,
            duration_minutes: 6,
            display_order: 1,
            quiz_questions: [
              {
                question: 'What does IaaS stand for?',
                options: ['Internet as a Service', 'Infrastructure as a Service', 'Information as a Solution', 'Integrated Application Service'],
                correct_index: 1,
              },
              {
                question: 'Which service model requires the LEAST management from the user?',
                options: ['IaaS', 'PaaS', 'SaaS', 'On-premises'],
                correct_index: 2,
              },
              {
                question: 'What is a key benefit of cloud computing?',
                options: ['Higher upfront costs', 'Limited locations', 'Pay only for what you use', 'Slower deployment'],
                correct_index: 2,
              },
            ],
          },
          {
            title: 'AWS Overview',
            title_fr: 'Aperçu AWS',
            content_type: 'article',
            article_body: `# AWS Overview\n\nAmazon Web Services (AWS) is the largest cloud platform with 200+ services.\n\n## Core Services\n\n- **EC2:** Virtual servers\n- **S3:** Object storage (files, images, backups)\n- **RDS:** Managed databases\n- **Lambda:** Serverless functions\n- **CloudFront:** CDN for fast content delivery\n\n## Getting Started\n\n1. Create an AWS Free Tier account\n2. Explore the console\n3. Try launching an EC2 instance\n4. Store a file in S3\n\n## AWS in Africa\n\nAWS has a region in Cape Town (af-south-1), making it relevant for African businesses needing low-latency access.\n\n## Certifications\n\n- **Cloud Practitioner:** Entry-level, great for non-technical roles\n- **Solutions Architect Associate:** Most popular, good for developers\n- **Developer Associate:** Focus on building on AWS`,
            article_body_fr: `# Aperçu AWS\n\nAmazon Web Services (AWS) est la plus grande plateforme cloud avec plus de 200 services.\n\n## Services Principaux\n\n- **EC2 :** Serveurs virtuels\n- **S3 :** Stockage d'objets\n- **RDS :** Bases de données gérées\n- **Lambda :** Fonctions serverless\n\n## AWS en Afrique\n\nAWS a une région au Cap (af-south-1).`,
            duration_minutes: 6,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What is AWS S3 used for?',
                options: ['Running virtual servers', 'Object storage', 'Managing databases', 'Sending emails'],
                correct_index: 1,
              },
              {
                question: 'Where is the AWS Africa region located?',
                options: ['Lagos', 'Nairobi', 'Cape Town', 'Douala'],
                correct_index: 2,
              },
              {
                question: 'Which AWS certification is best for beginners?',
                options: ['Solutions Architect Professional', 'Cloud Practitioner', 'DevOps Engineer', 'Security Specialty'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Azure Overview',
            title_fr: 'Aperçu Azure',
            content_type: 'article',
            article_body: `# Azure Overview\n\nMicrosoft Azure is the second-largest cloud platform, deeply integrated with Microsoft tools.\n\n## Core Services\n\n- **Virtual Machines:** Similar to AWS EC2\n- **Blob Storage:** Similar to AWS S3\n- **Azure SQL:** Managed SQL databases\n- **Azure Functions:** Serverless computing\n- **Azure DevOps:** CI/CD and project management\n\n## Why Azure?\n\n- If your company uses Microsoft 365, Azure integrates seamlessly\n- Strong in enterprise and hybrid cloud\n- Good for .NET developers\n- Growing African presence with data centers in South Africa\n\n## AWS vs Azure Comparison\n\n| Feature | AWS | Azure |\n|---------|-----|-------|\n| Compute | EC2 | Virtual Machines |\n| Storage | S3 | Blob Storage |\n| Serverless | Lambda | Functions |\n| Database | RDS | Azure SQL |\n| Market share | #1 | #2 |`,
            article_body_fr: `# Aperçu Azure\n\nMicrosoft Azure est la deuxième plus grande plateforme cloud.\n\n## Services Principaux\n\n- Machines Virtuelles\n- Blob Storage\n- Azure SQL\n- Azure Functions\n\n## Pourquoi Azure ?\n\n- Intégration Microsoft 365\n- Fort en entreprise et cloud hybride\n- Présence africaine croissante`,
            duration_minutes: 6,
            display_order: 3,
            quiz_questions: [
              {
                question: 'What is Azure Blob Storage equivalent to in AWS?',
                options: ['EC2', 'S3', 'Lambda', 'RDS'],
                correct_index: 1,
              },
              {
                question: 'Why might a company choose Azure over AWS?',
                options: ['It\'s always cheaper', 'It integrates with Microsoft 365', 'It has more services', 'It\'s only for startups'],
                correct_index: 1,
              },
              {
                question: 'Which cloud platform is currently #1 in market share?',
                options: ['Azure', 'Google Cloud', 'AWS', 'IBM Cloud'],
                correct_index: 2,
              },
            ],
          },
        ],
      },
      {
        title: 'Interview Mastery',
        title_fr: 'Maîtrise des Entretiens',
        description: 'Ace behavioral and technical interviews with proven strategies.',
        description_fr: 'Réussissez les entretiens comportementaux et techniques avec des stratégies éprouvées.',
        slug: 'interview-mastery',
        difficulty: 'intermediate',
        estimated_minutes: 15,
        display_order: 3,
        modules: [
          {
            title: 'STAR Stories',
            title_fr: 'Histoires STAR',
            content_type: 'article',
            article_body: `# STAR Stories\n\nThe STAR method is the gold standard for answering behavioral interview questions.\n\n## What is STAR?\n\n- **S**ituation: Set the scene\n- **T**ask: What was your responsibility?\n- **A**ction: What did you specifically do?\n- **R**esult: What was the outcome? (Quantify if possible)\n\n## Example\n\n**Q: Tell me about a time you solved a difficult problem.**\n\n**S:** At my previous company, our website crashed during a major sales event.\n**T:** As the lead developer, I needed to restore service and prevent data loss.\n**A:** I identified the bottleneck (database connections), implemented connection pooling, and set up monitoring alerts.\n**R:** Service was restored in 45 minutes. I then implemented changes that prevented future crashes, saving an estimated $50K in potential lost revenue.\n\n## Prepare 5-7 STAR Stories\n\nCovering these themes:\n1. Leadership / taking initiative\n2. Teamwork / collaboration\n3. Problem-solving under pressure\n4. Handling failure / learning from mistakes\n5. Achieving results / exceeding expectations`,
            article_body_fr: `# Histoires STAR\n\nLa méthode STAR est le standard pour répondre aux questions d'entretien comportementales.\n\n## Qu'est-ce que STAR ?\n\n- **S**ituation : Plantez le décor\n- **T**âche : Quelle était votre responsabilité ?\n- **A**ction : Qu'avez-vous fait spécifiquement ?\n- **R**ésultat : Quel a été le résultat ?\n\n## Préparez 5-7 Histoires STAR\n\n1. Leadership\n2. Travail d'équipe\n3. Résolution de problèmes sous pression\n4. Gestion de l'échec\n5. Obtention de résultats`,
            duration_minutes: 5,
            display_order: 1,
            quiz_questions: [
              {
                question: 'What does the "A" in STAR stand for?',
                question_fr: 'Que signifie le « A » dans STAR ?',
                options: ['Achievement', 'Action', 'Analysis', 'Approach'],
                options_fr: ['Réalisation', 'Action', 'Analyse', 'Approche'],
                correct_index: 1,
              },
              {
                question: 'How many STAR stories should you prepare?',
                question_fr: 'Combien d\'histoires STAR devez-vous préparer ?',
                options: ['1-2', '5-7', '15-20', 'Just 1 good one'],
                options_fr: ['1-2', '5-7', '15-20', 'Juste 1 bonne'],
                correct_index: 1,
              },
              {
                question: 'What should you do when describing the Result?',
                question_fr: 'Que devez-vous faire en décrivant le Résultat ?',
                options: ['Keep it vague', 'Quantify if possible', 'Skip it', 'Exaggerate'],
                options_fr: ['Rester vague', 'Quantifier si possible', 'Le sauter', 'Exagérer'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Behavioral Questions',
            title_fr: 'Questions Comportementales',
            content_type: 'article',
            article_body: `# Common Behavioral Questions\n\n## Top 10 Questions & How to Approach Them\n\n### 1. "Tell me about yourself"\n- 2 minutes max. Present-Past-Future format.\n- Present: Current role/skills\n- Past: Relevant experience\n- Future: Why this opportunity\n\n### 2. "What's your greatest weakness?"\n- Choose a real weakness you're actively improving\n- Bad: "I'm a perfectionist" / "I work too hard"\n- Good: "I used to avoid public speaking, so I joined Toastmasters and now present quarterly"\n\n### 3. "Why should we hire you?"\n- Match your skills to the job requirements\n- Show enthusiasm for the specific company\n\n### 4. "Tell me about a conflict with a coworker"\n- Use STAR. Focus on resolution, not blame.\n\n### 5. "Where do you see yourself in 5 years?"\n- Show ambition aligned with the company's growth\n- "I want to deepen my expertise in [field] and take on more leadership responsibilities"\n\n## Red Flags to Avoid\n\n- Speaking negatively about previous employers\n- Having no questions for the interviewer\n- Being unprepared about the company\n- Giving answers that are too short or too long`,
            article_body_fr: `# Questions Comportementales Courantes\n\n## Top 10 Questions\n\n### 1. « Parlez-moi de vous »\n- 2 minutes max. Format Présent-Passé-Futur.\n\n### 2. « Quelle est votre plus grande faiblesse ? »\n- Choisissez une vraie faiblesse que vous améliorez activement\n\n### 3. « Pourquoi devrions-nous vous embaucher ? »\n- Alignez vos compétences avec les exigences du poste\n\n## Drapeaux Rouges à Éviter\n\n- Parler négativement des anciens employeurs\n- Ne pas avoir de questions\n- Être non préparé sur l'entreprise`,
            duration_minutes: 5,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What format should "Tell me about yourself" follow?',
                question_fr: 'Quel format devrait suivre « Parlez-moi de vous » ?',
                options: ['Past only', 'Present-Past-Future', 'Future only', 'Random order'],
                correct_index: 1,
              },
              {
                question: 'Which is a GOOD weakness answer?',
                question_fr: 'Quelle est une BONNE réponse de faiblesse ?',
                options: ['"I\'m a perfectionist"', '"I have no weaknesses"', '"I used to avoid public speaking, so I joined Toastmasters"', '"I work too hard"'],
                correct_index: 2,
              },
              {
                question: 'What is a red flag in interviews?',
                question_fr: 'Qu\'est-ce qui est un drapeau rouge en entretien ?',
                options: ['Asking questions', 'Speaking negatively about previous employers', 'Showing enthusiasm', 'Arriving early'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Technical Interview Tips',
            title_fr: 'Conseils Entretien Technique',
            content_type: 'article',
            article_body: `# Technical Interview Tips\n\n## Before the Interview\n\n1. **Review the job description** — know what they'll test\n2. **Practice on paper/whiteboard** — not just on a computer\n3. **Review fundamentals** — data structures, algorithms, system design basics\n4. **Prepare your environment** — for remote interviews, test your setup\n\n## During the Interview\n\n1. **Think out loud** — interviewers want to see your thought process\n2. **Ask clarifying questions** — "Can I assume the input is always valid?"\n3. **Start with a brute force solution** — then optimize\n4. **Test your solution** — walk through with a simple example\n5. **Handle edge cases** — empty input, single element, very large input\n\n## Common Technical Topics\n\n- Arrays and strings manipulation\n- SQL queries (see our SQL course!)\n- API design and REST principles\n- Basic system design (for senior roles)\n- Framework-specific questions (React, Node.js, etc.)\n\n## After the Interview\n\n- Send a thank-you email within 24 hours\n- Note questions you struggled with for future practice\n- Don't overthink — you often did better than you think`,
            article_body_fr: `# Conseils Entretien Technique\n\n## Avant l'Entretien\n\n1. Révisez la description du poste\n2. Pratiquez sur papier\n3. Révisez les fondamentaux\n4. Préparez votre environnement\n\n## Pendant l'Entretien\n\n1. Pensez à voix haute\n2. Posez des questions de clarification\n3. Commencez par une solution brute force\n4. Testez votre solution\n\n## Après l'Entretien\n\n- Envoyez un email de remerciement dans les 24 heures`,
            duration_minutes: 5,
            display_order: 3,
            quiz_questions: [
              {
                question: 'What should you do FIRST when solving a technical problem?',
                question_fr: 'Que devez-vous faire EN PREMIER pour résoudre un problème technique ?',
                options: ['Write optimized code', 'Ask clarifying questions', 'Give up', 'Copy from memory'],
                correct_index: 1,
              },
              {
                question: 'Why should you think out loud during technical interviews?',
                question_fr: 'Pourquoi devez-vous penser à voix haute pendant les entretiens techniques ?',
                options: ['To fill silence', 'Interviewers want to see your thought process', 'It\'s required', 'To impress them'],
                correct_index: 1,
              },
              {
                question: 'What should you send within 24 hours after an interview?',
                question_fr: 'Que devez-vous envoyer dans les 24 heures après un entretien ?',
                options: ['Your salary requirements', 'A thank-you email', 'Your references', 'A complaint'],
                correct_index: 1,
              },
            ],
          },
        ],
      },
    ],
  },

  // ===== TRACK 3: Shared Skills =====
  {
    title: 'Shared Skills',
    title_fr: 'Compétences Partagées',
    description: 'Essential skills for all professionals in the job market.',
    description_fr: 'Compétences essentielles pour tous les professionnels sur le marché de l\'emploi.',
    slug: 'shared-skills',
    icon: 'users',
    target_roles: ['job_seeker', 'talent'],
    display_order: 3,
    courses: [
      {
        title: 'Resume & CV Optimization',
        title_fr: 'Optimisation CV',
        description: 'Create resumes that pass ATS systems and impress recruiters.',
        description_fr: 'Créez des CV qui passent les systèmes ATS et impressionnent les recruteurs.',
        slug: 'resume-optimization',
        difficulty: 'beginner',
        estimated_minutes: 15,
        display_order: 1,
        modules: [
          {
            title: 'ATS Formatting',
            title_fr: 'Formatage ATS',
            content_type: 'article',
            article_body: `# ATS-Friendly Resume Formatting\n\nApplicant Tracking Systems (ATS) scan resumes before humans see them. 75% of resumes are rejected by ATS.\n\n## What ATS Looks For\n\n- **Keywords** from the job description\n- **Standard section headers** (Experience, Education, Skills)\n- **Clean formatting** (no tables, columns, or images)\n\n## Dos\n\n- Use standard fonts (Arial, Calibri, Times New Roman)\n- Use simple bullet points\n- Include exact keywords from the job posting\n- Save as .pdf or .docx (check what the posting requests)\n- Use standard section headers\n\n## Don'ts\n\n- Don't use tables or text boxes\n- Don't use headers/footers for important info\n- Don't use images or icons\n- Don't use unusual fonts\n- Don't use abbreviations without spelling out first\n\n## Pro Tip: Joblinca's Resume Builder\n\nUse Joblinca's built-in CV Builder — it's already ATS-optimized!`,
            article_body_fr: `# Formatage CV Compatible ATS\n\nLes systèmes ATS scannent les CV avant les humains. 75% des CV sont rejetés par l'ATS.\n\n## Ce que l'ATS Cherche\n\n- Mots-clés de la description de poste\n- En-têtes de section standard\n- Formatage propre\n\n## À Faire\n\n- Polices standard\n- Puces simples\n- Mots-clés exacts\n\n## À Ne Pas Faire\n\n- Pas de tableaux\n- Pas d'images\n- Pas de polices inhabituelles\n\n## Conseil : Utilisez le Générateur CV de Joblinca !`,
            duration_minutes: 5,
            display_order: 1,
            quiz_questions: [
              {
                question: 'What percentage of resumes are rejected by ATS?',
                question_fr: 'Quel pourcentage de CV sont rejetés par l\'ATS ?',
                options: ['25%', '50%', '75%', '95%'],
                correct_index: 2,
              },
              {
                question: 'Which of these should you AVOID in an ATS-friendly resume?',
                question_fr: 'Lequel devez-vous ÉVITER dans un CV compatible ATS ?',
                options: ['Bullet points', 'Standard fonts', 'Tables and images', 'Keywords from job posting'],
                correct_index: 2,
              },
              {
                question: 'Where should you get keywords for your resume?',
                question_fr: 'Où devez-vous trouver les mots-clés pour votre CV ?',
                options: ['Random internet sites', 'The job description', 'Your friend\'s resume', 'A dictionary'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Impact Statements',
            title_fr: 'Déclarations d\'Impact',
            content_type: 'article',
            article_body: `# Writing Impact Statements\n\nTransform boring job descriptions into powerful impact statements.\n\n## The Formula\n\n**Action Verb + What You Did + Measurable Result**\n\n## Before vs After\n\n| Before (Weak) | After (Strong) |\n|----------------|----------------|\n| "Responsible for sales" | "Increased quarterly sales by 35% through targeted outreach campaigns" |\n| "Managed a team" | "Led a team of 8 developers, delivering 3 projects ahead of schedule" |\n| "Handled customer complaints" | "Resolved 95% of customer issues within 24 hours, improving satisfaction scores by 20%" |\n\n## Power Action Verbs\n\n**Leadership:** Spearheaded, Directed, Orchestrated, Championed\n**Achievement:** Increased, Generated, Delivered, Surpassed\n**Problem-solving:** Resolved, Optimized, Streamlined, Transformed\n**Creation:** Designed, Developed, Launched, Implemented\n\n## Tips\n\n- Use numbers whenever possible\n- Focus on outcomes, not just duties\n- Start every bullet with a strong action verb\n- Tailor statements to the job you're applying for`,
            article_body_fr: `# Rédiger des Déclarations d'Impact\n\n## La Formule\n\n**Verbe d'Action + Ce que vous avez fait + Résultat Mesurable**\n\n## Avant vs Après\n\n| Avant | Après |\n|-------|-------|\n| « Responsable des ventes » | « Augmenté les ventes trimestrielles de 35% » |\n| « Géré une équipe » | « Dirigé une équipe de 8 développeurs, livrant 3 projets en avance » |\n\n## Verbes d'Action Puissants\n\nAugmenté, Généré, Livré, Résolu, Optimisé, Développé, Lancé`,
            duration_minutes: 5,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What is the formula for an impact statement?',
                question_fr: 'Quelle est la formule d\'une déclaration d\'impact ?',
                options: ['Name + Title + Company', 'Action Verb + What + Measurable Result', 'Date + Task + Comment', 'Just describe your duties'],
                correct_index: 1,
              },
              {
                question: 'Which is a stronger statement?',
                question_fr: 'Quelle déclaration est plus forte ?',
                options: ['"Responsible for sales"', '"Managed customers"', '"Increased sales by 35%"', '"Did a good job"'],
                correct_index: 2,
              },
              {
                question: 'What should every resume bullet point start with?',
                question_fr: 'Par quoi chaque point du CV devrait-il commencer ?',
                options: ['A date', 'A strong action verb', '"I was..."', 'The company name'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Cameroon vs International CVs',
            title_fr: 'CV Camerounais vs International',
            content_type: 'article',
            article_body: `# Cameroon vs International CV Standards\n\n## Key Differences\n\n| Feature | Cameroon Standard | International Standard |\n|---------|-------------------|------------------------|\n| Photo | Often included | Usually omitted (US/UK) |\n| Personal info | DOB, marital status included | Omit (anti-discrimination) |\n| Length | 2-3 pages common | 1 page preferred (US) |\n| References | Listed on CV | "Available upon request" |\n| Objective | Common | Replaced by Summary |\n\n## When to Use Which\n\n**Use Cameroon format for:**\n- Local companies in Cameroon\n- Government positions\n- French-language applications\n\n**Use International format for:**\n- Multinational companies\n- Remote work applications\n- International organizations\n- Tech companies\n\n## Best of Both Worlds\n\n1. Have both versions ready\n2. Read the job posting carefully — it often hints at the expected format\n3. When in doubt, use the international format — it's increasingly accepted in Cameroon too\n4. Always localize: use CFA for Cameroon roles, USD for international`,
            article_body_fr: `# CV Camerounais vs International\n\n## Différences Clés\n\n| Caractéristique | Camerounais | International |\n|-----------------|-------------|---------------|\n| Photo | Souvent incluse | Généralement omise |\n| Infos personnelles | Date de naissance, situation matrimoniale | À omettre |\n| Longueur | 2-3 pages | 1 page préférée |\n\n## Quand Utiliser Lequel\n\n**Format camerounais :** Entreprises locales, gouvernement\n**Format international :** Multinationales, travail à distance, tech`,
            duration_minutes: 5,
            display_order: 3,
            quiz_questions: [
              {
                question: 'Should you include a photo on an international CV?',
                question_fr: 'Devez-vous inclure une photo sur un CV international ?',
                options: ['Always', 'Usually no (US/UK standard)', 'Only if you\'re attractive', 'Yes, it\'s required'],
                correct_index: 1,
              },
              {
                question: 'When should you use the Cameroon CV format?',
                question_fr: 'Quand utiliser le format CV camerounais ?',
                options: ['Always', 'For local companies and government', 'For tech companies', 'Never'],
                correct_index: 1,
              },
              {
                question: 'When in doubt, which format should you default to?',
                question_fr: 'En cas de doute, quel format choisir ?',
                options: ['Cameroon format', 'International format', 'No format', 'Ask a friend'],
                correct_index: 1,
              },
            ],
          },
        ],
      },
      {
        title: 'LinkedIn Profile Building',
        title_fr: 'Construire son Profil LinkedIn',
        description: 'Build a LinkedIn profile that attracts recruiters and opportunities.',
        description_fr: 'Construisez un profil LinkedIn qui attire les recruteurs et les opportunités.',
        slug: 'linkedin-profile',
        difficulty: 'beginner',
        estimated_minutes: 15,
        display_order: 2,
        modules: [
          {
            title: 'Profile Checklist',
            title_fr: 'Checklist du Profil',
            content_type: 'article',
            article_body: `# LinkedIn Profile Checklist\n\n## Must-Have Elements\n\n- [ ] **Professional photo** — Face visible, good lighting, neutral background\n- [ ] **Banner image** — Custom banner related to your field\n- [ ] **Headline** — More than just your job title (see next module)\n- [ ] **Summary/About** — 3-5 paragraphs telling your professional story\n- [ ] **Experience** — All relevant positions with impact statements\n- [ ] **Education** — Degrees, certifications, relevant courses\n- [ ] **Skills** — At least 10 relevant skills\n- [ ] **Recommendations** — At least 2-3 from colleagues/managers\n\n## Profile Strength Levels\n\n1. **Beginner:** Name + photo + headline\n2. **Intermediate:** + summary + experience + education\n3. **All-Star:** + skills + recommendations + activity\n\nAim for **All-Star** — LinkedIn shows All-Star profiles 40x more in search results.\n\n## Quick Wins\n\n1. Turn on "Open to Work" (visible to recruiters only)\n2. Add your location (helps with local job matching)\n3. List languages (huge asset in Cameroon)`,
            article_body_fr: `# Checklist du Profil LinkedIn\n\n## Éléments Indispensables\n\n- Photo professionnelle\n- Image de bannière\n- Titre accrocheur\n- Résumé (3-5 paragraphes)\n- Expérience avec déclarations d'impact\n- Éducation\n- Au moins 10 compétences\n- 2-3 recommandations\n\n## Niveaux de Force du Profil\n\nVisez **All-Star** — LinkedIn montre ces profils 40x plus dans les résultats de recherche.`,
            duration_minutes: 5,
            display_order: 1,
            quiz_questions: [
              {
                question: 'How many times more do All-Star profiles appear in search?',
                question_fr: 'Combien de fois plus les profils All-Star apparaissent-ils dans la recherche ?',
                options: ['5x', '10x', '40x', '100x'],
                correct_index: 2,
              },
              {
                question: 'How many skills should you list at minimum?',
                question_fr: 'Combien de compétences devez-vous lister au minimum ?',
                options: ['3', '5', '10', '50'],
                correct_index: 2,
              },
              {
                question: 'What should your LinkedIn photo look like?',
                question_fr: 'À quoi devrait ressembler votre photo LinkedIn ?',
                options: ['Selfie at a party', 'Professional, good lighting, neutral background', 'Group photo', 'No photo is better'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Headline & Summary',
            title_fr: 'Titre & Résumé',
            content_type: 'article',
            article_body: `# Crafting Your LinkedIn Headline & Summary\n\n## Headline (120 characters)\n\nYour headline is the MOST important field after your name. It appears in search results and connection requests.\n\n### Formula\n**[Role] | [Specialty/Value] | [Keyword]**\n\nExamples:\n- "Full-Stack Developer | React & Node.js | Building Scalable Web Apps"\n- "Data Analyst | SQL & Python | Turning Data into Business Insights"\n- "Marketing Manager | Digital Growth | Douala, Cameroon"\n\n### Don'ts\n- "Looking for opportunities" (desperate)\n- "Unemployed" (use "Open to Work" feature instead)\n- Just your current title ("Software Developer at XYZ")\n\n## Summary (2,000 characters)\n\nTell your professional story in first person:\n\n**Paragraph 1:** Who you are and what you do\n**Paragraph 2:** Your key achievements and expertise\n**Paragraph 3:** What you're passionate about\n**Paragraph 4:** Call to action ("Let's connect!")\n\nInclude keywords recruiters search for in your industry.`,
            article_body_fr: `# Créer Votre Titre et Résumé LinkedIn\n\n## Titre (120 caractères)\n\n### Formule\n**[Rôle] | [Spécialité/Valeur] | [Mot-clé]**\n\n## Résumé (2000 caractères)\n\nRacontez votre histoire professionnelle à la première personne.\n\n1. Qui vous êtes\n2. Vos réalisations clés\n3. Vos passions\n4. Appel à l'action`,
            duration_minutes: 5,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What is the maximum length of a LinkedIn headline?',
                question_fr: 'Quelle est la longueur maximale d\'un titre LinkedIn ?',
                options: ['50 characters', '120 characters', '500 characters', 'Unlimited'],
                correct_index: 1,
              },
              {
                question: 'What should you NOT put in your headline?',
                question_fr: 'Que ne devez-vous PAS mettre dans votre titre ?',
                options: ['Your specialty', '"Looking for opportunities"', 'Keywords', 'Your role'],
                correct_index: 1,
              },
              {
                question: 'In what person should the summary be written?',
                question_fr: 'À quelle personne le résumé doit-il être rédigé ?',
                options: ['Third person', 'First person', 'Second person', 'No preference'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Networking Strategy',
            title_fr: 'Stratégie de Réseautage',
            content_type: 'article',
            article_body: `# LinkedIn Networking Strategy\n\n## Building Your Network\n\n### Who to Connect With\n1. **Current and former colleagues**\n2. **Alumni** from your school\n3. **People in your target companies**\n4. **Industry thought leaders**\n5. **Recruiters** in your field\n\n### Connection Request Messages\n\nAlways personalize! Example:\n> "Hi [Name], I came across your profile while researching [topic/company]. I'm a [your role] and would love to connect and learn from your experience in [their field]. Looking forward to connecting!"\n\n## Content Strategy\n\nPost 2-3 times per week:\n- Share industry articles with your commentary\n- Celebrate team or personal wins\n- Share lessons learned\n- Engage with others' posts (comment, not just like)\n\n## Cameroon-Specific Tips\n\n- Join Cameroon professional groups on LinkedIn\n- Connect with diaspora professionals\n- Follow companies you're interested in (MTN, Orange, local startups)\n- Share bilingual content to reach both communities`,
            article_body_fr: `# Stratégie de Réseautage LinkedIn\n\n## Construire Votre Réseau\n\n1. Collègues actuels et anciens\n2. Alumni\n3. Personnes dans vos entreprises cibles\n4. Leaders d'opinion\n5. Recruteurs\n\n## Stratégie de Contenu\n\nPubliez 2-3 fois par semaine.\n\n## Conseils Cameroun\n\n- Rejoignez les groupes professionnels camerounais\n- Connectez-vous avec les professionnels de la diaspora\n- Partagez du contenu bilingue`,
            duration_minutes: 5,
            display_order: 3,
            quiz_questions: [
              {
                question: 'How often should you post on LinkedIn?',
                question_fr: 'À quelle fréquence devez-vous publier sur LinkedIn ?',
                options: ['Once a month', '2-3 times per week', 'Every hour', 'Never'],
                correct_index: 1,
              },
              {
                question: 'What should you always do when sending a connection request?',
                question_fr: 'Que devez-vous toujours faire en envoyant une demande de connexion ?',
                options: ['Send it blank', 'Personalize the message', 'Demand they accept', 'Send 100 at once'],
                correct_index: 1,
              },
              {
                question: 'What is a Cameroon-specific LinkedIn tip?',
                question_fr: 'Quel est un conseil LinkedIn spécifique au Cameroun ?',
                options: ['Only post in English', 'Share bilingual content', 'Avoid local groups', 'Don\'t connect with recruiters'],
                correct_index: 1,
              },
            ],
          },
        ],
      },
    ],
  },

  // ===== TRACK 4: Leadership & Growth =====
  {
    title: 'Leadership & Growth',
    title_fr: 'Leadership & Croissance',
    description: 'Develop leadership and advanced interpersonal skills.',
    description_fr: 'Développez des compétences de leadership et interpersonnelles avancées.',
    slug: 'leadership-growth',
    icon: 'star',
    target_roles: ['job_seeker'],
    display_order: 4,
    courses: [
      {
        title: 'Leadership Fundamentals',
        title_fr: 'Fondamentaux du Leadership',
        description: 'Learn what makes an effective leader in modern workplaces.',
        description_fr: 'Apprenez ce qui fait un leader efficace dans les milieux de travail modernes.',
        slug: 'leadership-fundamentals',
        difficulty: 'advanced',
        estimated_minutes: 15,
        partner_name: 'edX',
        partner_url: 'https://www.edx.org/learn/leadership',
        display_order: 1,
        modules: [
          {
            title: 'What Makes a Leader',
            title_fr: 'Ce qui fait un Leader',
            content_type: 'article',
            article_body: `# What Makes a Leader\n\nLeadership is not about title or position — it's about influence and impact.\n\n## 5 Qualities of Great Leaders\n\n1. **Vision:** Ability to see the bigger picture and communicate it\n2. **Empathy:** Understanding team members' perspectives and feelings\n3. **Integrity:** Doing the right thing, even when no one is watching\n4. **Adaptability:** Adjusting approach based on circumstances\n5. **Decisiveness:** Making timely decisions with available information\n\n## Leadership Styles\n\n| Style | Best For |\n|-------|----------|\n| **Servant Leadership** | Building trust and developing people |\n| **Transformational** | Driving change and innovation |\n| **Democratic** | Team buy-in and creative solutions |\n| **Situational** | Adapting to different team needs |\n\n## Leadership vs Management\n\n- **Managers** focus on processes, systems, and efficiency\n- **Leaders** focus on people, vision, and inspiration\n- The best professionals do both`,
            article_body_fr: `# Ce qui fait un Leader\n\nLe leadership n'est pas une question de titre — c'est une question d'influence et d'impact.\n\n## 5 Qualités des Grands Leaders\n\n1. Vision\n2. Empathie\n3. Intégrité\n4. Adaptabilité\n5. Capacité de décision\n\n## Leadership vs Management\n\n- Les managers se concentrent sur les processus\n- Les leaders se concentrent sur les personnes et la vision`,
            duration_minutes: 5,
            display_order: 1,
            quiz_questions: [
              {
                question: 'What is leadership primarily about?',
                question_fr: 'De quoi le leadership est-il principalement question ?',
                options: ['Having a title', 'Influence and impact', 'Being the oldest', 'Making the most money'],
                correct_index: 1,
              },
              {
                question: 'Which leadership style is best for building trust?',
                question_fr: 'Quel style de leadership est le meilleur pour construire la confiance ?',
                options: ['Authoritarian', 'Servant Leadership', 'Laissez-faire', 'Autocratic'],
                correct_index: 1,
              },
              {
                question: 'What is the key difference between leaders and managers?',
                question_fr: 'Quelle est la différence clé entre leaders et managers ?',
                options: ['Leaders earn more', 'Leaders focus on people and vision, managers on processes', 'There is no difference', 'Managers are better'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Delegation & Feedback',
            title_fr: 'Délégation & Feedback',
            content_type: 'article',
            article_body: `# Delegation & Feedback\n\n## The Art of Delegation\n\n### Why Delegate?\n- Focus on high-impact work\n- Develop team members' skills\n- Prevent burnout\n- Scale your output\n\n### How to Delegate Effectively\n1. **Choose the right person** — Match task to skills and growth goals\n2. **Define the outcome** — Be clear about what "done" looks like\n3. **Set boundaries** — Budget, timeline, decision authority\n4. **Check in, don't micromanage** — Regular touchpoints, not constant oversight\n5. **Give credit** — Publicly acknowledge their work\n\n## Giving Effective Feedback\n\n### The SBI-I Framework\n- **Situation:** When/where\n- **Behavior:** What specifically happened\n- **Impact:** How it affected the team/project\n- **Improvement:** What to do differently\n\n### Positive Feedback Example\n"In yesterday's client meeting (S), you handled the tough questions calmly and with data (B). The client left feeling confident in our team (I). Keep doing that — it really builds trust (I)."\n\n### Constructive Feedback Example\n"During the sprint review (S), the presentation wasn't organized (B), which confused stakeholders about our progress (I). Next time, let's use the template and do a dry run the day before (I)."`,
            article_body_fr: `# Délégation & Feedback\n\n## L'Art de la Délégation\n\n1. Choisir la bonne personne\n2. Définir le résultat attendu\n3. Fixer les limites\n4. Vérifier sans micro-gérer\n5. Donner le crédit\n\n## Cadre SBI-I pour le Feedback\n\n- Situation\n- Comportement\n- Impact\n- Amélioration`,
            duration_minutes: 5,
            display_order: 2,
            quiz_questions: [
              {
                question: 'What does the second "I" in SBI-I stand for?',
                question_fr: 'Que signifie le deuxième « I » dans SBI-I ?',
                options: ['Investigation', 'Improvement', 'Information', 'Implementation'],
                correct_index: 1,
              },
              {
                question: 'What should you do when delegating?',
                question_fr: 'Que devez-vous faire lors de la délégation ?',
                options: ['Micromanage constantly', 'Define the outcome clearly', 'Do the work yourself', 'Give no guidance'],
                correct_index: 1,
              },
              {
                question: 'Why should leaders delegate?',
                question_fr: 'Pourquoi les leaders devraient-ils déléguer ?',
                options: ['To be lazy', 'To develop team members and scale output', 'To avoid responsibility', 'It\'s not important'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Leading in Cameroonian Organizations',
            title_fr: 'Diriger dans les Organisations Camerounaises',
            content_type: 'article',
            article_body: `# Leading in Cameroonian Organizations\n\n## Understanding the Context\n\nLeadership in Cameroon blends traditional values with modern business practices.\n\n## Key Cultural Factors\n\n### Respect for Hierarchy\n- Seniority and titles matter\n- Decisions often flow top-down\n- As a leader, balance authority with approachability\n\n### Community and Relationships\n- Business is deeply relational\n- Take time to build personal connections\n- Team lunches and social events build trust\n\n### Bilingual Dynamics\n- Be inclusive of both Anglophone and Francophone colleagues\n- Provide communications in both languages when possible\n- Be sensitive to regional differences\n\n## Modern Leadership in Cameroon\n\n### What's Changing\n- Younger workforce expects more participative leadership\n- Tech companies are adopting flat hierarchies\n- Remote work is increasing (especially post-COVID)\n- Diaspora returnees bring international practices\n\n### Blending Old and New\n1. Respect traditions while introducing new ideas gradually\n2. Use data to support decisions (not just hierarchy)\n3. Create feedback channels (anonymous if needed)\n4. Mentor young professionals — they're the future\n\n## Leadership Challenge\n\nThink about a situation where cultural expectations and modern management practices conflicted. How would you navigate it?`,
            article_body_fr: `# Diriger dans les Organisations Camerounaises\n\n## Facteurs Culturels Clés\n\n### Respect de la Hiérarchie\n- L'ancienneté et les titres comptent\n- Équilibrez autorité et accessibilité\n\n### Communauté et Relations\n- Les affaires sont profondément relationnelles\n- Construisez des connexions personnelles\n\n### Dynamiques Bilingues\n- Soyez inclusif envers les collègues anglophones et francophones\n\n## Leadership Moderne\n\n- La jeune main-d'œuvre attend plus de participation\n- Les entreprises tech adoptent des hiérarchies plates\n- Le travail à distance augmente`,
            duration_minutes: 5,
            display_order: 3,
            quiz_questions: [
              {
                question: 'What is a key cultural factor in Cameroonian leadership?',
                question_fr: 'Quel est un facteur culturel clé du leadership camerounais ?',
                options: ['Ignore hierarchy', 'Respect for hierarchy', 'Only use English', 'Avoid social events'],
                correct_index: 1,
              },
              {
                question: 'How should leaders handle bilingual dynamics?',
                question_fr: 'Comment les leaders devraient-ils gérer les dynamiques bilingues ?',
                options: ['Only communicate in French', 'Be inclusive of both languages', 'Ignore language differences', 'Force one language'],
                correct_index: 1,
              },
              {
                question: 'What do younger Cameroonian workers expect?',
                question_fr: 'Qu\'attendent les jeunes travailleurs camerounais ?',
                options: ['Stricter hierarchy', 'More participative leadership', 'Less technology', 'No change'],
                correct_index: 1,
              },
            ],
          },
        ],
      },
      {
        title: 'Soft Skills Mastery',
        title_fr: 'Maîtrise des Compétences Douces',
        description: 'Develop emotional intelligence and conflict resolution skills.',
        description_fr: 'Développez l\'intelligence émotionnelle et les compétences de résolution de conflits.',
        slug: 'soft-skills-mastery',
        difficulty: 'intermediate',
        estimated_minutes: 10,
        display_order: 2,
        modules: [
          {
            title: 'Emotional Intelligence',
            title_fr: 'Intelligence Émotionnelle',
            content_type: 'article',
            article_body: `# Emotional Intelligence (EQ)\n\nEQ is often more important than IQ for career success. It's your ability to understand and manage emotions.\n\n## The 5 Components (Daniel Goleman)\n\n1. **Self-Awareness:** Recognizing your own emotions\n2. **Self-Regulation:** Managing your reactions\n3. **Motivation:** Internal drive beyond money\n4. **Empathy:** Understanding others' emotions\n5. **Social Skills:** Managing relationships effectively\n\n## Why EQ Matters at Work\n\n- 90% of top performers have high EQ\n- EQ predicts job performance better than IQ\n- Leaders with high EQ have more engaged teams\n\n## Practical Exercises\n\n### Self-Awareness Journal\nEach evening, note:\n- 3 emotions you felt today\n- What triggered each\n- How you responded\n- How you could respond better\n\n### The 6-Second Pause\nWhen triggered emotionally:\n1. Stop\n2. Take a breath\n3. Count to 6\n4. Choose your response\n\nThis prevents reactive behavior and gives your rational brain time to engage.`,
            article_body_fr: `# Intelligence Émotionnelle (QE)\n\nLe QE est souvent plus important que le QI pour la réussite professionnelle.\n\n## Les 5 Composantes (Daniel Goleman)\n\n1. Conscience de soi\n2. Autorégulation\n3. Motivation\n4. Empathie\n5. Compétences sociales\n\n## Exercices Pratiques\n\n### Journal de Conscience de Soi\nChaque soir, notez 3 émotions ressenties.\n\n### La Pause de 6 Secondes\nQuand vous êtes déclenché émotionnellement : arrêtez, respirez, comptez jusqu'à 6, choisissez votre réponse.`,
            duration_minutes: 5,
            display_order: 1,
            quiz_questions: [
              {
                question: 'How many components make up EQ according to Goleman?',
                question_fr: 'Combien de composantes forment le QE selon Goleman ?',
                options: ['3', '5', '7', '10'],
                correct_index: 1,
              },
              {
                question: 'What percentage of top performers have high EQ?',
                question_fr: 'Quel pourcentage des meilleurs performeurs ont un QE élevé ?',
                options: ['50%', '70%', '90%', '100%'],
                correct_index: 2,
              },
              {
                question: 'What is the purpose of the "6-second pause"?',
                question_fr: 'Quel est le but de la « pause de 6 secondes » ?',
                options: ['To waste time', 'To prevent reactive behavior', 'To count seconds', 'To avoid the conversation'],
                correct_index: 1,
              },
            ],
          },
          {
            title: 'Conflict Resolution',
            title_fr: 'Résolution de Conflits',
            content_type: 'article',
            article_body: `# Conflict Resolution\n\nConflict is natural in any workplace. The key is handling it constructively.\n\n## The 5 Conflict Styles (Thomas-Kilmann)\n\n1. **Competing:** Win-lose (use for urgent decisions)\n2. **Collaborating:** Win-win (best for important issues)\n3. **Compromising:** Give and take (good for medium issues)\n4. **Avoiding:** Postpone (only for trivial issues)\n5. **Accommodating:** Give in (to preserve relationships)\n\n## The DESC Method for Addressing Conflict\n\n- **D**escribe: State the facts objectively\n- **E**xpress: Share how it affects you\n- **S**pecify: What you'd like to happen\n- **C**onsequences: What happens if resolved (positive)\n\n## Example\n\n"When deadlines are missed without communication (D), it creates stress for the whole team and risks our client relationship (E). I'd like us to agree that anyone who might miss a deadline gives 48-hour notice (S). This way, we can redistribute work and keep the client happy (C)."\n\n## De-escalation Techniques\n\n1. Lower your voice (don't match escalation)\n2. Use "I" statements instead of "you" accusations\n3. Find common ground first\n4. Take a break if emotions are too high\n5. Follow up in writing to confirm agreements`,
            article_body_fr: `# Résolution de Conflits\n\nLe conflit est naturel. La clé est de le gérer de manière constructive.\n\n## Méthode DESC\n\n- **D**écrire : Énoncer les faits objectivement\n- **E**xprimer : Partager comment cela vous affecte\n- **S**pécifier : Ce que vous aimeriez qu'il se passe\n- **C**onséquences : Ce qui se passe si résolu\n\n## Techniques de Désescalade\n\n1. Baissez la voix\n2. Utilisez des déclarations « Je »\n3. Trouvez un terrain d'entente\n4. Prenez une pause si nécessaire`,
            duration_minutes: 5,
            display_order: 2,
            quiz_questions: [
              {
                question: 'Which conflict style aims for a win-win outcome?',
                question_fr: 'Quel style de conflit vise un résultat gagnant-gagnant ?',
                options: ['Competing', 'Avoiding', 'Collaborating', 'Accommodating'],
                correct_index: 2,
              },
              {
                question: 'What does the "D" in DESC stand for?',
                question_fr: 'Que signifie le « D » dans DESC ?',
                options: ['Demand', 'Describe', 'Decide', 'Dismiss'],
                correct_index: 1,
              },
              {
                question: 'What should you use instead of "you" accusations?',
                question_fr: 'Que devez-vous utiliser à la place des accusations « tu/vous » ?',
                options: ['"They" statements', '"We" statements', '"I" statements', '"It" statements'],
                correct_index: 2,
              },
            ],
          },
        ],
      },
    ],
  },
];
