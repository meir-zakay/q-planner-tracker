import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function PageNotFound() {
    const navigate = useNavigate();

    useEffect(() => {
        navigate('/Dashboard', { replace: true });
    }, [navigate]);

    return null;
}