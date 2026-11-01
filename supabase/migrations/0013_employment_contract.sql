-- «عقد عمل» (1 Nov 2026): the employment contract for a full-time creative (the manager's Figma page «عقود الموظفين»).
-- Only a new template kind: the rows, rights and signing flow are the same as every other contract (party = 'creative').
alter type contract_kind add value if not exists 'employment';
