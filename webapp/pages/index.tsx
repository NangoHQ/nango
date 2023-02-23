import Head from 'next/head';
import { Inter } from '@next/font/google';
import styles from '@/styles/Home.module.css';
import { Grid, Card } from '@geist-ui/core';

const inter = Inter({ subsets: ['latin'] });

export default function Home() {
    return (
        <>
            <Head>
                <title>Nango - Dashboard</title>
                <meta name="description" content="Nango's Main Dashboard" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <main className={styles.main}>
                <Grid.Container gap={2} justify="center" height="100px">
                    <Grid xs={6}>
                        <Card shadow width="100%" />
                    </Grid>
                    <Grid xs={6}>
                        <Card shadow width="100%" />
                    </Grid>
                    <Grid xs={6}>
                        <Card shadow width="100%" />
                    </Grid>
                </Grid.Container>
            </main>
        </>
    );
}
