import React, {type ReactNode} from 'react';
import NavbarLayout from '@theme/Navbar/Layout';
import NavbarContent from '@theme/Navbar/Content';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function Navbar(): ReactNode {
  // 备案审核模式（BEIAN_ONLY=1）：整站隐藏导航栏
  const {siteConfig} = useDocusaurusContext();
  if ((siteConfig.customFields as {beianOnly?: boolean} | undefined)?.beianOnly) {
    return null;
  }
  return (
    <NavbarLayout>
      <NavbarContent />
    </NavbarLayout>
  );
}
